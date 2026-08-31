import type { EvidenceRecord } from '../../tooling/evidence/store.js'
import { SubmissionValidator } from '../../tooling/reconstruction/validate.js'
import type { Harness } from '../../harness/index.js'
import { canonicalKey, type Section } from './canonical.js'
import { resolveClaims, type ClaimEntry, type GapEntry } from './boards.js'

/**
 * Deterministic merge → document → validate → (caller) submit.
 * Per-item schema failure: drop and record. Section-level failure: optional
 * one retry of that extractor. Assembler submits, not a model.
 */

const SECTIONS: Section[] = ['operations', 'semantic_facts', 'dependencies', 'workflows', 'claims']
const PREFIX: Record<Section, string> = {
  operations: 'op',
  semantic_facts: 'fact',
  dependencies: 'dep',
  workflows: 'wf',
  claims: 'claim',
}

export interface DroppedItem {
  section: Section
  reason: string
  item: unknown
}

export interface AssembleResult {
  document: Record<string, unknown>
  dropped: DroppedItem[]
  conflicts: GapEntry[]
  retried: string[]
}

export function assembleFromClaims(input: {
  claims: ClaimEntry[]
  nextGapId: number
  evidence: EvidenceRecord[]
  validator: SubmissionValidator
}): AssembleResult {
  const { winners, conflicts } = resolveClaims(input.claims, input.nextGapId)
  const bySection: Record<Section, Record<string, unknown>[]> = {
    operations: [],
    semantic_facts: [],
    dependencies: [],
    workflows: [],
    claims: [],
  }
  for (const winner of winners) {
    const item = withEvidence(winner, input.evidence)
    bySection[winner.section].push(item)
  }
  return assembleFromSectionItems({
    sections: bySection,
    validator: input.validator,
    extraConflicts: conflicts,
  })
}

export function assembleFromSectionItems(input: {
  sections: Partial<Record<Section, unknown[]>>
  validator: SubmissionValidator
  extraConflicts?: GapEntry[]
}): AssembleResult {
  const dropped: DroppedItem[] = []
  const kept: Record<Section, Record<string, unknown>[]> = {
    operations: [],
    semantic_facts: [],
    dependencies: [],
    workflows: [],
    claims: [],
  }

  for (const section of SECTIONS) {
    const list = input.sections[section] ?? []
    for (const raw of list) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        dropped.push({ section, reason: 'malformed: not an object', item: raw })
        continue
      }
      const item = { ...(raw as Record<string, unknown>) }
      delete item.id
      if (looksMalformed(item, section)) {
        dropped.push({ section, reason: 'malformed item', item })
        continue
      }
      const stub = stubDocument(section, { ...item, id: 'tmp' })
      const checked = input.validator.check(stub)
      const itemErrors = checked.errors.filter((e) => e.includes(`/${section}/0`) || e.includes(`/${section}/1`))
      // Validator also reports other empty sections as fine. Extra properties on the
      // item show up under /{section}/0.
      if (!checked.valid && itemErrors.length > 0) {
        dropped.push({ section, reason: itemErrors.join('; '), item })
        continue
      }
      kept[section].push(item)
    }
  }

  const document = buildDocument(kept)
  const whole = input.validator.check(document)
  return {
    document: asRecord(whole.normalized) ?? document,
    dropped,
    conflicts: input.extraConflicts ?? [],
    retried: [],
  }
}

export async function submitAssembled(harness: Harness, document: unknown): Promise<void> {
  await harness.submit_reconstruction(document)
}

function buildDocument(kept: Record<Section, Record<string, unknown>[]>): Record<string, unknown> {
  const document: Record<string, unknown> = { schema_version: '1.0.0' }
  for (const section of SECTIONS) {
    const items = kept[section].map((item, index) => ({
      ...item,
      id: `${PREFIX[section]}-${index + 1}`,
    }))
    document[section] = items
  }
  return document
}

function stubDocument(section: Section, item: Record<string, unknown>): Record<string, unknown> {
  const document: Record<string, unknown> = {
    schema_version: '1.0.0',
    operations: [],
    semantic_facts: [],
    dependencies: [],
    workflows: [],
    claims: [],
  }
  document[section] = [item]
  return document
}

function looksMalformed(item: Record<string, unknown>, section: Section): boolean {
  if (section === 'operations' && (typeof item.method !== 'string' || typeof item.path !== 'string')) return true
  if (section === 'semantic_facts' && typeof item.meaning !== 'string') return true
  if (section === 'dependencies' && (typeof item.source_operation !== 'string' || typeof item.target_operation !== 'string')) {
    return true
  }
  if (section === 'workflows' && (!Array.isArray(item.steps) || typeof item.user_goal !== 'string')) return true
  if (section === 'claims' && typeof item.statement !== 'string') return true
  return false
}

function withEvidence(entry: ClaimEntry, evidence: EvidenceRecord[]): Record<string, unknown> {
  const item = { ...entry.item }
  if (Array.isArray(item.evidence) && item.evidence.length > 0) return item
  const nested = nestedFromIds(entry.evidenceIds, evidence)
  if (nested.length > 0) item.evidence = nested
  return item
}

function nestedFromIds(ids: string[], evidence: EvidenceRecord[]): Array<Record<string, unknown>> {
  const byId = new Map(evidence.map((row) => [row.id, row]))
  const out: Array<Record<string, unknown>> = []
  for (const id of ids) {
    const record = byId.get(id)
    if (!record) continue
    if (record.kind === 'network_event') {
      const method = typeof record.data.method === 'string' ? record.data.method : undefined
      const path = typeof record.data.path === 'string' ? record.data.path : undefined
      const status = typeof record.data.status === 'number' ? record.data.status : undefined
      out.push(compact({ kind: 'network_request', method, path, status }))
      out.push(compact({ kind: 'network_response', method, path, status }))
    } else if (record.kind === 'ui_action' || record.kind === 'policy_decision') {
      const element = asRecord(record.data.element) ?? {}
      out.push(
        compact({
          kind: 'ui_action',
          page: typeof record.data.page === 'string' ? record.data.page : undefined,
          ui_text: typeof element.label === 'string' ? element.label : undefined,
          note:
            record.kind === 'policy_decision'
              ? `click blocked by risk policy: ${String(record.data.riskClass)}, verdict ${String(record.data.verdict)}`
              : undefined,
        }),
      )
    }
  }
  return out
}

function compact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return null
}

/** Used by selftest: turn a raw section array into claim entries (or drop unparseable). */
export function claimsFromParsedSection(
  section: Section,
  items: unknown[] | null,
  producedBy: string,
  round: number,
): { claims: ClaimEntry[]; unparseable: boolean } {
  if (items === null) return { claims: [], unparseable: true }
  const claims: ClaimEntry[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = { ...(raw as Record<string, unknown>) }
    delete item.id
    const key = canonicalKey(section, item)
    if (!key) continue
    const evidence = Array.isArray(item.evidence) ? item.evidence : []
    claims.push({
      section,
      canonicalKey: key,
      item,
      evidenceIds: evidence.length > 0 ? ['nested'] : [],
      producedBy,
      support: 'observed',
      round,
    })
  }
  return { claims, unparseable: false }
}
