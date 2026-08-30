import type { Page, Request, Response } from 'playwright'
import { normalizePath, operationKey } from './paths.js'

/**
 * Network observation (docs/02 §2, "Network" layer).
 *
 * Records only what a browser can see: method, normalized path, status, bodies,
 * timing, and a correlation id linking a request to its response and to the UI
 * action that caused it. Mechanics only — nothing here decides or interprets
 * (ADR-10).
 */

export interface NetworkEvent {
  /** Correlation id, also used to tie the event to a trajectory step. */
  id: string
  method: string
  /** Canonical key path: concrete ids and parameter names erased. */
  path: string
  /** The path as observed, ids intact. Never used as a matching key. */
  rawPath: string
  query: Record<string, string>
  status: number | null
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  requestBody: unknown
  responseBody: unknown
  /** Milliseconds from request start to response. */
  durationMs: number | null
  /** Index of the agent step during which the request started. */
  step: number
  startedAt: number
}

const MAX_BODY_BYTES = 64 * 1024
const REDACTED = '[redacted]'
/** Redacted in place, per docs/07 §4 — credentials must not reach run artifacts. */
const SECRET_KEYS = new Set(['password', 'passwordhash', 'token', 'authorization', 'secret'])
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-csrf-token'])

function redactBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactBody)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? REDACTED : redactBody(v)
    }
    return out
  }
  return value
}

/**
 * Header VALUES for auth headers are redacted, their PRESENCE is kept: whether a
 * request carried `X-CSRF-Token` is exactly the observation `sem-csrf-header`
 * rests on, while the token itself is a credential.
 */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = SECRET_HEADERS.has(k.toLowerCase()) ? REDACTED : v
  }
  return out
}

function parseBody(text: string | null): unknown {
  if (text == null) return null
  const clipped = text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text
  try {
    return redactBody(JSON.parse(clipped))
  } catch {
    return clipped === text ? clipped : `${clipped}…[truncated]`
  }
}

function queryOf(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const [k, v] of new URL(url).searchParams) out[k] = v
  } catch {
    /* relative or malformed url — no query to record */
  }
  return out
}

export class NetworkRecorder {
  private events: NetworkEvent[] = []
  private pending = new Map<Request, NetworkEvent>()
  private seq = 0
  private step = 0

  /** Called by the harness before each agent action, so events carry their step. */
  setStep(step: number): void {
    this.step = step
  }

  attach(page: Page): void {
    page.on('request', (request) => this.onRequest(request))
    page.on('response', (response) => void this.onResponse(response))
    page.on('requestfailed', (request) => {
      const event = this.pending.get(request)
      if (event) {
        event.status = null
        event.durationMs = Date.now() - event.startedAt
        this.pending.delete(request)
      }
    })
  }

  private onRequest(request: Request): void {
    const url = request.url()
    // Only the target's own API traffic is observation; assets are noise.
    if (!this.isApiRequest(url)) return
    const pathname = safePathname(url)
    const event: NetworkEvent = {
      id: `net_${String(++this.seq).padStart(4, '0')}`,
      method: request.method().toUpperCase(),
      path: normalizePath(pathname),
      rawPath: pathname,
      query: queryOf(url),
      status: null,
      requestHeaders: redactHeaders(request.headers()),
      responseHeaders: {},
      requestBody: parseBody(request.postData()),
      responseBody: null,
      durationMs: null,
      step: this.step,
      startedAt: Date.now(),
    }
    this.pending.set(request, event)
    this.events.push(event)
  }

  private async onResponse(response: Response): Promise<void> {
    const event = this.pending.get(response.request())
    if (!event) return
    this.pending.delete(response.request())
    event.status = response.status()
    event.responseHeaders = redactHeaders(response.headers())
    event.durationMs = Date.now() - event.startedAt
    try {
      event.responseBody = parseBody(await response.text())
    } catch {
      event.responseBody = null
    }
  }

  private isApiRequest(url: string): boolean {
    return safePathname(url).startsWith('/api/')
  }

  /** Events recorded since `afterId` (exclusive), oldest first. */
  since(afterId?: string): NetworkEvent[] {
    if (!afterId) return [...this.events]
    const index = this.events.findIndex((e) => e.id === afterId)
    return index === -1 ? [...this.events] : this.events.slice(index + 1)
  }

  all(): NetworkEvent[] {
    return [...this.events]
  }

  /** Distinct operation keys observed so far — a coverage signal, not a score. */
  observedOperations(): string[] {
    return [...new Set(this.events.map((e) => operationKey(e.method, e.rawPath)))].sort()
  }

  /** Resolves once no API request has been in flight for `quietMs`. */
  async settle(quietMs = 400, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    let quietSince = Date.now()
    while (Date.now() < deadline) {
      if (this.pending.size > 0) quietSince = Date.now()
      else if (Date.now() - quietSince >= quietMs) return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
