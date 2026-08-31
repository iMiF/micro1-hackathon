import type { EvidenceRecord } from '../../tooling/evidence/store.js'
import type { GapEntry } from './boards.js'
import type { PageSnapshot } from './digest.js'

/**
 * DomainSweeper — deterministic set difference. Every select's `options` (and
 * every filter control seen on a page) minus the values that actually appeared
 * for that same control or the query parameter it drives. Uncovered values
 * become gaps with a concrete proposed action. Not a judgement.
 */

export function sweepDomains(
  evidence: EvidenceRecord[],
  pages: PageSnapshot[],
  round: number,
): { claims: never[]; gaps: Omit<GapEntry, 'id'>[] } {
  const scoped = collectScopedTraffic(evidence)
  const gaps: Omit<GapEntry, 'id'>[] = []
  const seen = new Set<string>()

  for (const page of pages) {
    for (const control of page.controls) {
      const options = optionsOf(control)
      if (options.length === 0) continue
      const uncovered = options.filter((option) => !optionCovered(option, page.path, control.label, scoped))
      for (const option of uncovered) {
        const key = `${page.path}|${control.label}|${option}`
        if (seen.has(key)) continue
        seen.add(key)
        const action =
          control.role === 'select'
            ? `On ${page.path}, select "${control.label}" = ${optionValue(option)}`
            : `On ${page.path}, set filter "${control.label}" to ${optionValue(option)}`
        gaps.push({
          origin: 'sweeper',
          question: `${action}. This option was listed on the page and never appeared in captured traffic for this control.`,
          evidenceIds: evidenceIdsForPage(evidence, page.path),
          status: 'open',
          round,
        })
      }
    }
  }

  return { claims: [], gaps }
}

/**
 * High-value coverage holes the Explorer routinely skips (DELETE, cancel→50,
 * quote reuse, archive+order, stale version). Seeded as gaps so the Inquisitor
 * ranks them; not claims.
 */
export function seedCoverageGaps(evidence: EvidenceRecord[], round: number): Array<Omit<GapEntry, 'id'>> {
  const networks = evidence.filter((r) => r.kind === 'network_event')
  const ops = new Set(
    networks.map((r) => {
      const method = typeof r.data.method === 'string' ? r.data.method.toUpperCase() : 'GET'
      const path = typeof r.data.path === 'string' ? r.data.path : ''
      return `${method} ${path}`
    }),
  )
  const ids = networks.length > 0 ? [networks[0]!.id] : evidence.length > 0 ? [evidence[0]!.id] : []
  if (ids.length === 0) return []

  const statusIds = new Set<number>()
  for (const record of networks) {
    collectStatusIds(record.data.request_body, statusIds)
    collectStatusIds(record.data.response_body, statusIds)
    const query = asRecord(record.data.query)
    if (query.status != null) {
      const n = Number(query.status)
      if (Number.isFinite(n)) statusIds.add(n)
    }
  }

  const errorCodes = new Set<string>()
  for (const record of networks) {
    collectErrorCodes(record.data.response_body, errorCodes)
  }

  const gaps: Array<Omit<GapEntry, 'id'>> = []
  const push = (question: string) => {
    gaps.push({ origin: 'sweeper', question, evidenceIds: ids, status: 'open', round })
  }

  if (ops.has('GET /api/orders') && !ops.has('DELETE /api/orders/{}')) {
    push(
      'On an order detail page, use Delete on a draft order (statusId 10). DELETE /api/orders/{} was never observed.',
    )
  }
  if (ops.has('GET /api/customers') && !ops.has('DELETE /api/customers/{}')) {
    push(
      'On a customer detail page, use Delete on a customer with no orders. DELETE /api/customers/{} was never observed.',
    )
  }
  if (ops.has('PATCH /api/orders/{}/status') && !statusIds.has(50)) {
    push(
      'On an order detail page, select Status = Cancelled (50) and save. statusId 50 was never observed in traffic.',
    )
  }
  if (ops.has('POST /api/order-quotes') && !errorCodes.has('QUOTE_ALREADY_USED')) {
    push(
      'Create a quote, submit an order with it, then POST /api/orders again with the same quoteId. Expect QUOTE_ALREADY_USED.',
    )
  }
  if (ops.has('PATCH /api/customers/{}') && !errorCodes.has('CUSTOMER_ARCHIVED') && !errorCodes.has('VERSION_CONFLICT')) {
    push(
      'Archive a customer, then try to create an order quote for them (CUSTOMER_ARCHIVED). Also retry PATCH with a stale version (VERSION_CONFLICT).',
    )
  }
  if (ops.has('POST /api/order-quotes') && !errorCodes.has('OUT_OF_STOCK') && !errorCodes.has('PRODUCT_INACTIVE')) {
    push(
      'On the new-order form, add a product until stock is exhausted or pick an inactive product. Expect OUT_OF_STOCK or PRODUCT_INACTIVE.',
    )
  }

  return gaps
}

interface ScopedTraffic {
  byControl: Map<string, Set<string>>
  byQuery: Map<string, Set<string>>
}

function collectScopedTraffic(evidence: EvidenceRecord[]): ScopedTraffic {
  const byControl = new Map<string, Set<string>>()
  const byQuery = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    let bucket = map.get(key)
    if (!bucket) {
      bucket = new Set()
      map.set(key, bucket)
    }
    bucket.add(value)
  }

  for (const record of evidence) {
    if (record.kind === 'ui_action' && record.data.value != null) {
      const element = asRecord(record.data.element)
      const label = typeof element.label === 'string' ? element.label : ''
      const page = typeof record.data.page === 'string' ? record.data.page : ''
      const value = String(record.data.value)
      if (label) add(byControl, `${page}|${label}`, value)
      if (label) add(byControl, label, value)
    }
    if (record.kind !== 'network_event') continue
    const query = asRecord(record.data.query)
    for (const [name, raw] of Object.entries(query)) {
      if (raw == null) continue
      add(byQuery, name, String(raw))
    }
  }
  return { byControl, byQuery }
}

function optionCovered(
  option: string,
  pagePath: string,
  label: string,
  scoped: ScopedTraffic,
): boolean {
  const value = optionValue(option)
  const candidates = [option, value]
  const asNum = Number(value)
  if (Number.isFinite(asNum)) candidates.push(String(asNum))

  const controlKeys = [`${pagePath}|${label}`, label]
  for (const key of controlKeys) {
    const bucket = scoped.byControl.get(key)
    if (bucket && candidates.some((c) => bucket.has(c))) return true
  }
  for (const param of queryNamesForLabel(label)) {
    const bucket = scoped.byQuery.get(param)
    if (bucket && candidates.some((c) => bucket.has(c))) return true
  }
  return false
}

function queryNamesForLabel(label: string): string[] {
  const compact = label.replace(/\s+/g, '')
  const lower = compact.charAt(0).toLowerCase() + compact.slice(1)
  const out = new Set<string>([compact, lower, label.toLowerCase().replace(/\s+/g, '')])
  if (/status/i.test(label)) {
    out.add('status')
    out.add('statusId')
  }
  if (/archiv/i.test(label)) out.add('archived')
  if (/active/i.test(label)) out.add('active')
  if (/country/i.test(label)) out.add('country')
  if (/region/i.test(label)) out.add('regionId')
  return [...out]
}

function optionsOf(control: PageSnapshot['controls'][number]): string[] {
  if (Array.isArray(control.options) && control.options.length > 0) return control.options
  return []
}

/** observe_page shows `value|label` for selects; the tool takes the value side. */
function optionValue(option: string): string {
  const bar = option.indexOf('|')
  return bar >= 0 ? option.slice(0, bar) : option
}

function evidenceIdsForPage(evidence: EvidenceRecord[], page: string): string[] {
  const ids = evidence
    .filter((record) => {
      if (record.kind === 'ui_action' && record.data.page === page) return true
      return false
    })
    .map((record) => record.id)
  if (ids.length > 0) return [...new Set(ids)].sort()
  return evidence.length > 0 ? [evidence[0]!.id] : []
}

function collectStatusIds(value: unknown, into: Set<number>): void {
  if (value == null) return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    for (const entry of value) collectStatusIds(entry, into)
    return
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    if (typeof row.statusId === 'number') into.add(row.statusId)
    for (const entry of Object.values(row)) collectStatusIds(entry, into)
  }
}

function collectErrorCodes(value: unknown, into: Set<string>): void {
  if (value == null) return
  if (Array.isArray(value)) {
    for (const entry of value) collectErrorCodes(entry, into)
    return
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>
    if (typeof row.code === 'string') into.add(row.code)
    for (const entry of Object.values(row)) collectErrorCodes(entry, into)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}
