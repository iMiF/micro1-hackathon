/**
 * Path normalization (docs/04 §4 rule 1).
 *
 * The canonical key erases path-parameter NAMES, not just concrete values.
 *
 * Ground truth is not internally consistent about naming: it has
 * `GET /api/orders/{id}/activity` but `GET /api/customers/{customerId}/addresses`.
 * An agent has no way to know which convention applies where, so a name-sensitive
 * key would cost points for a correctly discovered operation. Erasing the name
 * makes `/api/customers/{customerId}/addresses`, `/api/customers/{id}/addresses`
 * and `/api/customers/12/addresses` one and the same key.
 *
 * Both the agent-side serializer and the evaluator must use this function, or
 * they will disagree.
 */

const PARAM = '{}'

/** A segment that is a concrete resource id rather than a route word. */
function isConcreteId(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true
  // uuid
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true
  return false
}

/** `{id}`, `{customerId}`, `:id` — any already-templated segment. */
function isTemplated(segment: string): boolean {
  return /^\{.*\}$/.test(segment) || /^:.+/.test(segment)
}

/**
 * `/api/customers/12/addresses/3?q=x` -> `/api/customers/{}/addresses/{}`
 * Query string and trailing slash are dropped; the query lives in `parameters`.
 */
export function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath
  const withoutHash = withoutQuery.split('#')[0] ?? withoutQuery
  const segments = withoutHash.split('/').filter((s) => s.length > 0)
  const normalized = segments.map((s) => (isConcreteId(s) || isTemplated(s) ? PARAM : s))
  return '/' + normalized.join('/')
}

/** The unit the evaluator matches operations by: method + normalized path. */
export function operationKey(method: string, rawPath: string): string {
  return `${method.toUpperCase()} ${normalizePath(rawPath)}`
}

/** Concrete ids that were erased, in order — useful for evidence, never for matching. */
export function extractPathIds(rawPath: string): string[] {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath
  return withoutQuery.split('/').filter((s) => s.length > 0 && isConcreteId(s))
}
