export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { code?: string; message?: string } & Record<string, unknown>,
  ) {
    super(body.message ?? `Request failed with ${status}`)
  }
}

let csrfToken: string | null = null

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (csrfToken && method !== 'GET' && method !== 'HEAD') {
    headers.set('X-CSRF-Token', csrfToken)
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (response.status === 204) {
    return undefined as T
  }

  const data = (await response.json().catch(() => ({}))) as {
    csrfToken?: string
    code?: string
    message?: string
  } & T

  if (data && typeof data === 'object' && 'csrfToken' in data && typeof data.csrfToken === 'string') {
    csrfToken = data.csrfToken
  }

  if (!response.ok) {
    throw new ApiError(response.status, data as { code?: string; message?: string })
  }

  return data as T
}
