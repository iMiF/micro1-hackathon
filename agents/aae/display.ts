/**
 * Display-only fields on an operation. They are for the artifact generator,
 * not for VARS. Invalid values are stripped so they never drop the operation.
 */

export function sanitizeOperationDisplay(item: Record<string, unknown>): void {
  if ('summary' in item) {
    if (typeof item.summary !== 'string' || item.summary.trim() === '') delete item.summary
    else item.summary = item.summary.trim()
  }
  if ('authentication' in item) {
    if (typeof item.authentication !== 'string' || item.authentication.trim() === '') delete item.authentication
    else item.authentication = item.authentication.trim()
  }
  if ('confidence' in item) {
    const value = coerceConfidence(item.confidence)
    if (value == null) delete item.confidence
    else item.confidence = value
  }
}

function coerceConfidence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed
  }
  return null
}
