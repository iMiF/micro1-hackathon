/**
 * Recovering a submission from what a model actually emitted (ADR-12, ADR-17).
 *
 * The tool schema nests the document under `reconstruction`. Models that do not
 * follow Anthropic's tool shape often emit the document as the tool input
 * itself, or as a text block in the same turn, or — when the generation hits
 * `max_tokens` mid-JSON — as an argument the provider cannot serialize at all
 * and delivers as `{}`.
 *
 * Everything here is mechanical unwrapping: find the document, close what a
 * truncation left open. It never chooses a `kind`, maps prose into the schema,
 * or invents a fact. It lives in `tooling/` rather than in one agent's tree so
 * that baseline and AAE recover identically — an unequal recovery path would
 * silently favour whichever system got it (ADR-12: "an equal number of
 * retries").
 */

/** Top-level array sections the schema requires. */
const REQUIRED_SECTIONS = [
  'operations',
  'semantic_facts',
  'dependencies',
  'workflows',
  'claims',
] as const

/**
 * Normal path: the document as the model meant to send it. Unchanged behaviour
 * — used on every submit attempt, including the retries.
 */
export function recoverSubmission(input: unknown, siblingText = ''): unknown {
  const args = asRecord(input)
  if (args.reconstruction != null) return args.reconstruction
  if (looksLikeReconstruction(args)) return args
  return parseReconstructionJson(siblingText)
}

/**
 * Last resort, once the loop is over and nothing was stored: try the normal
 * path first, then repair a JSON document that was cut off mid-generation, then
 * supply `[]` for any required section the truncation took with it.
 *
 * The empty-section fill is what makes salvage worth having: without it a
 * truncated document fails schema validation and scores zero, with it the
 * operations that *were* recovered score. It cannot inflate a score — an empty
 * section contributes no true positives, and the facts it does not contain are
 * counted as false negatives exactly as they would be if the run had submitted
 * nothing at all.
 */
export function salvageSubmission(input: unknown, siblingText = ''): unknown {
  const direct = recoverSubmission(input, siblingText)
  if (direct !== undefined) return withRequiredSections(direct)

  for (const candidate of [jsonSlice(siblingText), jsonSlice(safeStringify(input))]) {
    if (candidate === undefined) continue
    const repaired = repairTruncatedJson(candidate)
    if (looksLikeReconstruction(repaired)) return withRequiredSections(repaired)
  }
  return undefined
}

export function looksLikeReconstruction(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.schema_version === 'string' || Array.isArray(record.operations)
}

export function parseReconstructionJson(text: string): unknown {
  const raw = jsonSlice(text)
  if (raw === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return looksLikeReconstruction(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Close a JSON document that stops mid-way: keep everything up to the last
 * complete nested value, drop the partial one, and close the containers that
 * are still open. Purely structural — no value is edited, added, or guessed.
 */
export function repairTruncatedJson(raw: string): unknown {
  const scanned = scanJson(raw)
  if (scanned.stack.length === 0) return undefined
  if (scanned.lastComplete < 0) return undefined

  const head = raw.slice(0, scanned.lastComplete + 1)
  const tail = scanJson(head)
  if (tail.inString || tail.stack.length === 0) return undefined
  try {
    return JSON.parse(head + tail.stack.slice().reverse().join('')) as unknown
  } catch {
    return undefined
  }
}

function withRequiredSections(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const copy = { ...(value as Record<string, unknown>) }
  if (typeof copy.schema_version !== 'string') copy.schema_version = '1.0.0'
  for (const section of REQUIRED_SECTIONS) {
    if (!Array.isArray(copy[section])) copy[section] = []
  }
  return copy
}

/** The widest `{...}` span in a string, unwrapping a fenced block if there is one. */
function jsonSlice(text: string): string | undefined {
  if (!text) return undefined
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/)
  const raw = fenced?.[1] ?? text
  const start = raw.indexOf('{')
  if (start < 0) return undefined
  const end = raw.lastIndexOf('}')
  return end > start ? raw.slice(start, end + 1) : raw.slice(start)
}

function scanJson(raw: string): { stack: string[]; inString: boolean; lastComplete: number } {
  const stack: string[] = []
  let inString = false
  let escaped = false
  let lastComplete = -1

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']')
      continue
    }
    if (ch === '}' || ch === ']') {
      stack.pop()
      // A value that closed while something is still open is a complete nested
      // value: a safe place to cut a truncated document.
      if (stack.length > 0) lastComplete = i
    }
  }
  return { stack, inString, lastComplete }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Operator diagnostics for a submit attempt. Logged, never scored. */
export function describeSubmitPayload(input: unknown, siblingText: string): string {
  const args = asRecord(input)
  const argBytes = safeStringify(input).length
  const nested = args.reconstruction != null ? safeStringify(args.reconstruction).length : 0
  return `input=${argBytes}B nested=${nested}B text=${siblingText.length}B keys=[${Object.keys(args).join(',')}]`
}
