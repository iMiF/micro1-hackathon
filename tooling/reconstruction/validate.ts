import { readFileSync } from 'node:fs'
import Ajv, { type ErrorObject } from 'ajv'

/**
 * The deterministic serialization layer of ADR-12.
 *
 * Both agents write their own schema-conformant JSON; this only checks it,
 * assigns missing ids, trims and de-duplicates, and reports failures so the
 * agent can try again — the same number of retries for both systems.
 *
 * It performs NO semantic work. It never chooses a `kind`, never maps prose
 * into the schema, never guesses a synonym. If a change to this file would make
 * a wrong submission score better, the change belongs in an agent, not here.
 */

/** Extra attempts after the first invalid submit. Same number for both systems (ADR-12). */
export const VALIDATION_RETRIES = 2

export interface ValidationResult {
  valid: boolean
  /** Human-readable messages, safe to hand back to the agent for a retry. */
  errors: string[]
  /** The submission with ids assigned and duplicates removed. */
  normalized: unknown
}

export class SubmissionValidator {
  private readonly validate: ReturnType<Ajv['compile']>

  constructor(schemaPath: string) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
    const ajv = new Ajv({ allErrors: true, strict: false })
    this.validate = ajv.compile(schema)
  }

  check(submission: unknown): ValidationResult {
    const normalized = normalize(submission)
    const valid = this.validate(normalized) as boolean
    const errors = valid ? [] : formatErrors(this.validate.errors ?? [])
    return { valid, errors, normalized }
  }
}

function formatErrors(errors: ErrorObject[]): string[] {
  return errors.slice(0, 50).map((error) => {
    const where = error.instancePath || '(root)'
    const extra = error.params && Object.keys(error.params).length > 0
      ? ` ${JSON.stringify(error.params)}`
      : ''
    return `${where} ${error.message ?? 'invalid'}${extra}`
  })
}

/**
 * Mechanical tidying only: trim strings, drop exact duplicates, assign an id to
 * anything that needs one and does not have one. Nothing here inspects meaning.
 */
function normalize(submission: unknown): unknown {
  if (!submission || typeof submission !== 'object') return submission
  const copy = structuredClone(submission) as Record<string, unknown>

  trimStrings(copy)

  for (const [section, prefix] of [
    ['operations', 'op'],
    ['semantic_facts', 'fact'],
    ['dependencies', 'dep'],
    ['workflows', 'wf'],
    ['claims', 'claim'],
  ] as const) {
    const list = copy[section]
    if (!Array.isArray(list)) continue
    const deduped = dedupe(list)
    deduped.forEach((entry, index) => {
      if (entry && typeof entry === 'object' && !('id' in entry)) {
        ;(entry as Record<string, unknown>).id = `${prefix}-${index + 1}`
      }
    })
    copy[section] = deduped
  }

  return copy
}

function dedupe(list: unknown[]): unknown[] {
  const seen = new Set<string>()
  const out: unknown[] = []
  for (const entry of list) {
    // `id` is excluded from the identity: two facts that differ only by the id
    // the agent happened to assign are one fact.
    const key = JSON.stringify(entry, (k, v) => (k === 'id' ? undefined : v))
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

function trimStrings(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (typeof entry === 'string') value[index] = entry.trim()
      else trimStrings(entry)
    })
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === 'string') (value as Record<string, unknown>)[key] = entry.trim()
      else trimStrings(entry)
    }
  }
}
