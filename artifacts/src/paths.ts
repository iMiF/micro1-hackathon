import type { Parameter } from './types.js'

/**
 * Turn reconstruction placeholders `{}` into OpenAPI `{name}` using path
 * parameters in order. Named `{id}` segments are left alone. A `{}` with no
 * matching path-parameter name is left as `{}` — the generator does not invent
 * a name.
 */
export function expandPathPlaceholders(path: string, parameters: Parameter[] | undefined): string {
  const names = (parameters ?? []).filter((p) => p.location === 'path').map((p) => p.name)
  let i = 0
  return path.replaceAll('{}', () => {
    const name = names[i]
    i += 1
    return name ? `{${name}}` : '{}'
  })
}
