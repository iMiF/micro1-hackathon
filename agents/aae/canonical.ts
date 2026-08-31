import { normalizePath } from '../../tooling/browser/paths.js'

/**
 * Canonical matching keys, mirrored from the published rules in docs/04 §4
 * (all ten, including ADR-16 rules 7–10). Duplicated on purpose: AAE must not
 * import evaluator/ (ADR-10). Path erasure (rule 1) is the shared mechanic in
 * tooling/browser/paths.ts — that one is imported, not reimplemented.
 */

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

const UNORDERED_VALUE_KEYS = new Set([
  'to',
  'accepts',
  'matches',
  'requires',
  'base',
  'excludedStatusIds',
])

export type Section = 'operations' | 'semantic_facts' | 'dependencies' | 'workflows' | 'claims'

export function normalizeMethod(method: string): string {
  return method.trim().toUpperCase()
}

export function normalizeOperationRef(ref: string): string {
  const trimmed = ref.trim()
  if (trimmed === '*') return '*'
  const match = trimmed.match(/^(\S+)\s+(.+)$/)
  if (!match) return trimmed
  const method = match[1] ?? ''
  const rest = (match[2] ?? '').trim()
  if (!HTTP_METHODS.has(method.toUpperCase())) return trimmed
  if (rest === '*') return `${method.toUpperCase()} *`
  return `${method.toUpperCase()} ${normalizePath(rest)}`
}

/**
 * Rule 8: query-parameter subjects become `METHOD /normalizedPath?param`.
 * `GET /api/customers/suggest` is not rewritten — `suggest` is a path segment.
 */
export function normalizeSubject(subject: string): string {
  const trimmed = subject.trim()
  if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S/i.test(trimmed)) return trimmed
  const match = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i)
  if (!match) return normalizeOperationRef(trimmed)
  const method = (match[1] ?? '').toUpperCase()
  let rest = (match[2] ?? '').trim()
  let param: string | null = null
  const queryDot = rest.match(/^(\/\S+)\s+query\.(\w+)$/i)
  if (queryDot) {
    rest = queryDot[1] ?? rest
    param = queryDot[2] ?? null
  } else {
    const spaceParam = rest.match(/^(\/[^\s?]+)\s+(\w+)$/)
    if (spaceParam) {
      rest = spaceParam[1] ?? rest
      param = spaceParam[2] ?? null
    }
  }
  const qIdx = rest.indexOf('?')
  let pathPart = rest
  if (qIdx >= 0) {
    const qs = rest.slice(qIdx + 1)
    pathPart = rest.slice(0, qIdx)
    if (!param) param = qs.split('&')[0]?.split('=')[0] ?? null
  }
  const path = normalizePath(pathPart)
  if (param) return `${method} ${path}?${param}`
  return `${method} ${path}`
}

/** Rule 7: JSONPath array indexes wildcard to `[]`; `$[]` / `$[*]` prefix → `$.`. */
export function normalizeJsonPath(path: string): string {
  let s = path.replace(/\[(\d+|\*)?\]/g, '[]')
  s = s.replace(/^\$\[\]\.?/, '$.')
  if (s === '$.') return '$'
  return s
}

/**
 * Rule 6 prefixes, case-sensitive except `header:` names (HTTP is case-insensitive).
 * Bare `{name}` collapses to `{}` (rule 1). JSONPath goes through rule 7.
 */
export function normalizeFieldRef(ref: string): string {
  const trimmed = ref.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('header:')) {
    return 'header:' + trimmed.slice('header:'.length).trim().toLowerCase()
  }
  if (lower.startsWith('set-cookie:')) {
    return 'Set-Cookie:' + trimmed.slice('set-cookie:'.length).trim()
  }
  if (lower.startsWith('cookie:')) {
    return 'cookie:' + trimmed.slice('cookie:'.length).trim()
  }
  if (/^\{.*\}$/.test(trimmed)) return '{}'
  if (trimmed.startsWith('$')) return normalizeJsonPath(trimmed)
  return trimmed
}

function coerceAcceptsItem(value: unknown): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return normalizeValue(value)
}

export function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.trim()
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(normalizeValue)
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(entry) && UNORDERED_VALUE_KEYS.has(key)) {
      const items = key === 'accepts' ? entry.map(coerceAcceptsItem) : entry.map(normalizeValue)
      out[key] = items.slice().sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
    } else {
      out[key] = normalizeValue(entry)
    }
  }
  return out
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

function normalizeWorkflowRole(role: string): string {
  return role === 'auth' ? 'required_business' : role
}

export function operationKey(item: Record<string, unknown>): string | null {
  if (typeof item.method !== 'string' || typeof item.path !== 'string') return null
  return `${normalizeMethod(item.method)} ${normalizePath(item.path)}`
}

export function semanticFactKey(item: Record<string, unknown>): string | null {
  if (typeof item.kind !== 'string' || typeof item.subject !== 'string' || item.value === undefined) {
    return null
  }
  return `${item.kind}||${normalizeSubject(item.subject)}||${stableStringify(normalizeValue(item.value))}`
}

export function semanticFactSubjectKind(item: Record<string, unknown>): string | null {
  if (typeof item.kind !== 'string' || typeof item.subject !== 'string') return null
  return `${item.kind}||${normalizeSubject(item.subject)}`
}

export function dependencyKey(item: Record<string, unknown>): string | null {
  if (typeof item.source_operation !== 'string' || typeof item.target_operation !== 'string') return null
  const sourceField = typeof item.source_field === 'string' ? normalizeFieldRef(item.source_field) : ''
  const targetField = typeof item.target_field === 'string' ? normalizeFieldRef(item.target_field) : ''
  return `${normalizeOperationRef(item.source_operation)}||${sourceField}||${normalizeOperationRef(item.target_operation)}||${targetField}`
}

/** Rule 10: drop `refresh` steps; `auth` scores as `required_business`. Ordered and exact. */
export function workflowKey(item: Record<string, unknown>): string | null {
  if (!Array.isArray(item.steps) || item.steps.length === 0) return null
  const seq: Array<[string, string]> = []
  for (const step of item.steps) {
    if (!step || typeof step !== 'object') return null
    const row = step as Record<string, unknown>
    if (typeof row.operation !== 'string') return null
    const role = typeof row.role === 'string' ? row.role : ''
    if (role === 'refresh') continue
    seq.push([normalizeOperationRef(row.operation), normalizeWorkflowRole(role)])
  }
  if (seq.length === 0) return null
  return stableStringify(seq)
}

export function claimKey(item: Record<string, unknown>): string | null {
  if (typeof item.statement !== 'string') return null
  return item.statement.trim()
}

export function canonicalKey(section: Section, item: Record<string, unknown>): string | null {
  switch (section) {
    case 'operations':
      return operationKey(item)
    case 'semantic_facts':
      return semanticFactKey(item)
    case 'dependencies':
      return dependencyKey(item)
    case 'workflows':
      return workflowKey(item)
    case 'claims':
      return claimKey(item)
  }
}
