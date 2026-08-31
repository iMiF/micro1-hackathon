import type { EvidenceRecord } from '../../tooling/evidence/store.js'
import type { ClaimEntry, GapEntry } from './boards.js'

/**
 * TrafficMiner — deterministic. Reads captured traffic and emits claims or
 * gaps. Never invents a fact: every claim carries at least one evidence id.
 */

interface Family {
  method: string
  path: string
  events: EvidenceRecord[]
}

export function mineTraffic(
  evidence: EvidenceRecord[],
  round: number,
): { claims: ClaimEntry[]; gaps: Omit<GapEntry, 'id'>[] } {
  const claims: ClaimEntry[] = []
  const gaps: Omit<GapEntry, 'id'>[] = []
  const networks = evidence.filter((r) => r.kind === 'network_event')
  const uiValues = uiSetValues(evidence)
  const families = groupFamilies(networks)

  for (const family of families) {
    const ids = family.events.map((e) => e.id)
    if (ids.length === 0) continue

    const queryNames = namesOnEveryRequest(family, 'query')
    for (const name of queryNames) {
      const values = distinctQueryValues(family, name)
      const setByUi = values.every((v) => uiValues.has(`${name}=${v}`))
      if (!setByUi) {
        gaps.push({
          origin: 'miner',
          question: `${name} is present on every ${family.method} ${family.path} request. Is it required by the server, or a client default? Values observed: ${values.join(', ')}. Do not record accepts:[default] — a parameter the UI always sends is not query semantics.`,
          evidenceIds: ids,
          status: 'open',
          round,
        })
      }
    }

    const listCap = responseListCap(family)
    if (listCap) {
      gaps.push({
        origin: 'miner',
        question: `Response list length on ${family.method} ${family.path} looks capped at ${listCap.size} (parameter ${listCap.param}). Confirm the default vs a server-enforced limit; do not emit accepts:[${listCap.size}] as a fact.`,
        evidenceIds: ids,
        status: 'open',
        round,
      })
    }

    const numeric = numericIntervalFields(family)
    for (const field of numeric) {
      gaps.push({
        origin: 'miner',
        question: `Numeric field ${field.name} on ${family.method} ${family.path} looks like an interval or expiry (values ${field.values.join(', ')}). What does it measure?`,
        evidenceIds: field.evidenceIds,
        status: 'open',
        round,
      })
    }
  }

  return { claims, gaps }
}

function groupFamilies(events: EvidenceRecord[]): Family[] {
  const map = new Map<string, Family>()
  for (const event of events) {
    const method = typeof event.data.method === 'string' ? event.data.method.toUpperCase() : 'GET'
    const path = typeof event.data.path === 'string' ? event.data.path : ''
    if (!path) continue
    const key = `${method} ${path}`
    let family = map.get(key)
    if (!family) {
      family = { method, path, events: [] }
      map.set(key, family)
    }
    family.events.push(event)
  }
  return [...map.values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`))
}

function namesOnEveryRequest(family: Family, slot: 'query'): string[] {
  if (family.events.length < 2) return []
  const counts = new Map<string, number>()
  for (const event of family.events) {
    const query = asRecord(event.data[slot])
    for (const name of Object.keys(query)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n === family.events.length)
    .map(([name]) => name)
    .sort()
}

function distinctQueryValues(family: Family, name: string): string[] {
  const values = new Set<string>()
  for (const event of family.events) {
    const query = asRecord(event.data.query)
    if (name in query) values.add(String(query[name]))
  }
  return [...values].sort()
}

function uiSetValues(evidence: EvidenceRecord[]): Set<string> {
  const out = new Set<string>()
  for (const record of evidence) {
    if (record.kind !== 'ui_action') continue
    if (record.data.tool !== 'fill' && record.data.tool !== 'select') continue
    const element = asRecord(record.data.element)
    const label = typeof element.label === 'string' ? element.label.toLowerCase() : ''
    const value = record.data.value
    if (value == null) continue
    out.add(`${label}=${String(value)}`)
    const nameGuess = label.replace(/\s+/g, '')
    out.add(`${nameGuess}=${String(value)}`)
  }
  return out
}

function responseListCap(family: Family): { param: string; size: number } | null {
  const lengths: number[] = []
  let pageSize: string | undefined
  for (const event of family.events) {
    const body = event.data.response_body
    const query = asRecord(event.data.query)
    if (typeof query.pageSize === 'string' || typeof query.pageSize === 'number') {
      pageSize = String(query.pageSize)
    }
    if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
      lengths.push(((body as { items: unknown[] }).items).length)
    }
  }
  if (lengths.length < 2 || !pageSize) return null
  const size = Number(pageSize)
  if (!Number.isFinite(size) || size <= 0) return null
  if (lengths.every((n) => n === size) || lengths.some((n) => n === size)) {
    return { param: 'pageSize', size }
  }
  return null
}

function numericIntervalFields(family: Family): Array<{ name: string; values: string[]; evidenceIds: string[] }> {
  const looksLike = /(ttl|expir|interval|timeout|delay|ms|seconds|At)$/i
  const found = new Map<string, { values: Set<string>; ids: string[] }>()
  for (const event of family.events) {
    walk(event.data.response_body, '', (name, value) => {
      if (!looksLike.test(name)) return
      if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return
      let bucket = found.get(name)
      if (!bucket) {
        bucket = { values: new Set(), ids: [] }
        found.set(name, bucket)
      }
      bucket.values.add(String(value))
      bucket.ids.push(event.id)
    })
  }
  return [...found.entries()]
    .map(([name, bucket]) => ({
      name,
      values: [...bucket.values].sort(),
      evidenceIds: [...new Set(bucket.ids)].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function walk(value: unknown, prefix: string, visit: (name: string, value: unknown) => void): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 3)) walk(entry, prefix, visit)
    return
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const name = prefix ? `${prefix}.${key}` : key
    visit(key, entry)
    walk(entry, name, visit)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}
