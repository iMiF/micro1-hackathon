/**
 * Reconstruction `$ref` values point at `#/components/{Name}`. OpenAPI 3.1
 * schemas live at `#/components/schemas/{Name}`. Rewrite only the former.
 * Walks the value; does not add keys.
 */

const OAS_COMPONENT_KEYS = new Set(['schemas', 'parameters', 'responses', 'securitySchemes', 'headers', 'examples', 'links', 'callbacks', 'pathItems'])

export function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteRefs)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = key === '$ref' && typeof child === 'string' ? rewriteComponentRef(child) : rewriteRefs(child)
  }
  return out
}

export function rewriteComponentRef(ref: string): string {
  const match = /^#\/components\/([^/]+)$/.exec(ref)
  if (!match) return ref
  const name = match[1]
  if (!name || OAS_COMPONENT_KEYS.has(name)) return ref
  return `#/components/schemas/${name}`
}
