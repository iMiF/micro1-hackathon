export function parsePage(value: unknown, fallback = 1): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return fallback
  return n
}

export function parsePageSize(value: unknown, fallback = 20, max = 100): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) return fallback
  return Math.min(n, max)
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isInteger(n)) return undefined
  return n
}

export function likePattern(q: string): string {
  return `%${q.replace(/[%_]/g, '\\$&')}%`
}
