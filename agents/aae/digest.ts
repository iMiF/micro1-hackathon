import type { EvidenceRecord } from '../../tooling/evidence/store.js'
import { normalizePath } from '../../tooling/browser/paths.js'
import { stableStringify } from './canonical.js'

/**
 * Compact, deterministic view of the evidence store. Same evidence twice →
 * byte-identical JSON. No wall-clock timestamps: only relative deltas.
 */

export interface PageSnapshot {
  step: number
  path: string
  text: string
  controls: Array<{
    label: string
    role: string
    options: string[] | null
    enabled: boolean
    value?: string | null
  }>
}

export interface DigestStats {
  operations: number
  pages: number
  timelineEvents: number
  clippedArrays: number
  truncated: boolean
  bytes: number
}

export interface EvidenceDigest {
  operations: OperationDigest[]
  pages: PageDigest[]
  timeline: TimelineEvent[]
  stats: DigestStats
}

interface OperationDigest {
  method: string
  path: string
  sampleRawPaths: string[]
  statuses: number[]
  queryParameters: Array<{ name: string; values: unknown[] }>
  requestShapes: unknown[]
  responseShapes: unknown[]
  responseHeaderKeys: string[]
  durationsMs: number[]
  evidenceIds: string[]
}

interface PageDigest {
  path: string
  controls: Array<{ label: string; role: string; options: string[] | null; enabled: boolean }>
  textExcerpt: string
}

interface TimelineEvent {
  step: number
  uiAction: { tool: string; label: string; page?: string } | null
  requests: Array<{ method: string; path: string; status: unknown; evidenceId: string }>
  deltaMsFromAction: number | null
}

const ARRAY_SAMPLE = 6
const SHAPE_CAP = 3
const QUERY_VALUE_CAP = 12
const RAW_PATH_CAP = 4
const DURATION_CAP = 8
const TEXT_EXCERPT = 400
const DIGEST_MAX_BYTES = 120_000

export function buildDigest(
  evidence: EvidenceRecord[],
  pages: PageSnapshot[] = [],
): { digest: EvidenceDigest; json: string } {
  const clipStats = { clippedArrays: 0 }
  const operations = digestOperations(evidence, clipStats)
  const pageDigests = digestPages(pages, evidence)
  const timeline = digestTimeline(evidence)
  const stats: DigestStats = {
    operations: operations.length,
    pages: pageDigests.length,
    timelineEvents: timeline.length,
    clippedArrays: clipStats.clippedArrays,
    truncated: false,
    bytes: 0,
  }
  let digest: EvidenceDigest = { operations, pages: pageDigests, timeline, stats }
  let json = stableJson(digest)
  if (json.length > DIGEST_MAX_BYTES) {
    const shrunkPages = pageDigests.map((page) => ({
      ...page,
      textExcerpt: page.textExcerpt.slice(0, 120),
    }))
    digest = { operations, pages: shrunkPages, timeline, stats: { ...stats, truncated: true } }
    json = stableJson(digest)
    if (json.length > DIGEST_MAX_BYTES) {
      digest = {
        operations,
        pages: shrunkPages,
        timeline: timeline.slice(0, 80),
        stats: { ...stats, truncated: true, timelineEvents: Math.min(80, timeline.length) },
      }
      json = stableJson(digest)
    }
  }
  digest.stats.bytes = json.length
  json = stableJson(digest)
  return { digest, json }
}

function digestOperations(
  evidence: EvidenceRecord[],
  clipStats: { clippedArrays: number },
): OperationDigest[] {
  const groups = new Map<
    string,
    {
      method: string
      path: string
      rawPaths: Set<string>
      statuses: Set<number>
      query: Map<string, Set<string>>
      requestShapes: Map<string, unknown>
      responseShapes: Map<string, unknown>
      headerKeys: Set<string>
      durations: number[]
      evidenceIds: string[]
    }
  >()

  for (const record of evidence) {
    if (record.kind !== 'network_event') continue
    const data = record.data
    const method = typeof data.method === 'string' ? data.method.toUpperCase() : 'GET'
    const rawPath = typeof data.rawPath === 'string' ? data.rawPath : typeof data.path === 'string' ? data.path : '/'
    const path = typeof data.path === 'string' ? data.path : normalizePath(rawPath)
    const key = `${method} ${path}`
    let group = groups.get(key)
    if (!group) {
      group = {
        method,
        path,
        rawPaths: new Set(),
        statuses: new Set(),
        query: new Map(),
        requestShapes: new Map(),
        responseShapes: new Map(),
        headerKeys: new Set(),
        durations: [],
        evidenceIds: [],
      }
      groups.set(key, group)
    }
    group.evidenceIds.push(record.id)
    if (typeof data.rawPath === 'string') group.rawPaths.add(data.rawPath.split('?')[0] ?? data.rawPath)
    if (typeof data.status === 'number') group.statuses.add(data.status)
    if (typeof data.duration_ms === 'number') group.durations.push(data.duration_ms)
    const query = asRecord(data.query)
    for (const [name, value] of Object.entries(query)) {
      let bucket = group.query.get(name)
      if (!bucket) {
        bucket = new Set()
        group.query.set(name, bucket)
      }
      bucket.add(stableStringify(value))
    }
    const headers = asRecord(data.response_headers)
    for (const header of Object.keys(headers)) group.headerKeys.add(header.toLowerCase())
    addShape(group.requestShapes, data.request_body, clipStats)
    addShape(group.responseShapes, data.response_body, clipStats)
  }

  return [...groups.keys()]
    .sort()
    .map((key) => {
      const group = groups.get(key)
      if (!group) throw new Error('digest: missing group')
      const queryParameters = [...group.query.keys()].sort().map((name) => {
        const values = [...(group.query.get(name) ?? [])].sort().map((s) => {
          try {
            return JSON.parse(s) as unknown
          } catch {
            return s
          }
        })
        const clipped =
          values.length > QUERY_VALUE_CAP
            ? [...values.slice(0, QUERY_VALUE_CAP), { _omitted: values.length - QUERY_VALUE_CAP }]
            : values
        if (values.length > QUERY_VALUE_CAP) clipStats.clippedArrays += 1
        return { name, values: clipped }
      })
      const durations = uniqueNumbers(group.durations).slice(0, DURATION_CAP)
      return {
        method: group.method,
        path: group.path,
        sampleRawPaths: [...group.rawPaths].sort().slice(0, RAW_PATH_CAP),
        statuses: [...group.statuses].sort((a, b) => a - b),
        queryParameters,
        requestShapes: [...group.requestShapes.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, SHAPE_CAP).map((e) => e[1]),
        responseShapes: [...group.responseShapes.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, SHAPE_CAP).map((e) => e[1]),
        responseHeaderKeys: [...group.headerKeys].sort(),
        durationsMs: durations,
        evidenceIds: uniqueSorted(group.evidenceIds),
      }
    })
}

function digestPages(pages: PageSnapshot[], evidence: EvidenceRecord[]): PageDigest[] {
  const byPath = new Map<string, PageDigest>()
  for (const page of pages) {
    const path = page.path
    const controls = page.controls
      .map((c) => ({
        label: c.label,
        role: c.role,
        options: c.options ? [...c.options].sort() : null,
        enabled: c.enabled,
      }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.role.localeCompare(b.role))
    const existing = byPath.get(path)
    if (!existing) {
      byPath.set(path, {
        path,
        controls,
        textExcerpt: clipText(page.text),
      })
    } else {
      const merged = new Map<string, PageDigest['controls'][number]>()
      for (const c of [...existing.controls, ...controls]) merged.set(`${c.role}|${c.label}`, c)
      existing.controls = [...merged.values()].sort((a, b) => a.label.localeCompare(b.label) || a.role.localeCompare(b.role))
      if (page.text.length > existing.textExcerpt.length) existing.textExcerpt = clipText(page.text)
    }
  }
  // ui_action records still tell us which pages were visited when no snapshot exists.
  for (const record of evidence) {
    if (record.kind !== 'ui_action') continue
    const path = typeof record.data.page === 'string' ? record.data.page : ''
    if (!path || byPath.has(path)) continue
    const element = asRecord(record.data.element)
    const label = typeof element.label === 'string' ? element.label : ''
    const role = typeof element.role === 'string' ? element.role : 'other'
    byPath.set(path, {
      path,
      controls: label ? [{ label, role, options: null, enabled: true }] : [],
      textExcerpt: '',
    })
  }
  return [...byPath.keys()].sort().map((path) => byPath.get(path)!)
}

function digestTimeline(evidence: EvidenceRecord[]): TimelineEvent[] {
  const byStep = new Map<number, { actions: EvidenceRecord[]; networks: EvidenceRecord[] }>()
  for (const record of evidence) {
    let bucket = byStep.get(record.step)
    if (!bucket) {
      bucket = { actions: [], networks: [] }
      byStep.set(record.step, bucket)
    }
    if (record.kind === 'ui_action') bucket.actions.push(record)
    if (record.kind === 'network_event') bucket.networks.push(record)
  }
  const steps = [...byStep.keys()].sort((a, b) => a - b)
  const out: TimelineEvent[] = []
  for (const step of steps) {
    const bucket = byStep.get(step)
    if (!bucket) continue
    const action = bucket.actions[0]
    const actionAt = action ? Date.parse(action.at) : NaN
    const requests = bucket.networks
      .map((record) => {
        const method = typeof record.data.method === 'string' ? record.data.method.toUpperCase() : '?'
        const path = typeof record.data.path === 'string' ? record.data.path : ''
        return { method, path, status: record.data.status ?? null, evidenceId: record.id }
      })
      .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))
    let deltaMsFromAction: number | null = null
    if (action && bucket.networks[0] && Number.isFinite(actionAt)) {
      const netAt = Date.parse(bucket.networks[0].at)
      if (Number.isFinite(netAt)) deltaMsFromAction = netAt - actionAt
    }
    if (!action && requests.length === 0) continue
    const element = action ? asRecord(action.data.element) : {}
    out.push({
      step,
      uiAction: action
        ? {
            tool: typeof action.data.tool === 'string' ? action.data.tool : '',
            label: typeof element.label === 'string' ? element.label : '',
            page: typeof action.data.page === 'string' ? action.data.page : undefined,
          }
        : null,
      requests,
      deltaMsFromAction,
    })
  }
  return out
}

function addShape(into: Map<string, unknown>, body: unknown, clipStats: { clippedArrays: number }): void {
  const clipped = clipValue(body, clipStats)
  const key = shapeKey(clipped)
  if (into.size >= SHAPE_CAP && !into.has(key)) return
  if (!into.has(key)) into.set(key, clipped)
}

function shapeKey(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (Array.isArray(value)) return 'array:' + (value[0] ? shapeKey(value[0]) : 'empty')
  if (typeof value !== 'object') return typeof value
  return Object.keys(value as Record<string, unknown>).sort().join(',')
}

function clipValue(value: unknown, stats: { clippedArrays: number }): unknown {
  if (Array.isArray(value)) {
    const head = value.slice(0, ARRAY_SAMPLE).map((entry) => clipValue(entry, stats))
    if (value.length > ARRAY_SAMPLE) {
      stats.clippedArrays += 1
      return [...head, { _omitted: value.length - ARRAY_SAMPLE }]
    }
    return head
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = clipValue((value as Record<string, unknown>)[key], stats)
    }
    return out
  }
  return value
}

function clipText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > TEXT_EXCERPT ? collapsed.slice(0, TEXT_EXCERPT) : collapsed
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort()
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}
