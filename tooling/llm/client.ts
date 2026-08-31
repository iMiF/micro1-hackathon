import Anthropic from '@anthropic-ai/sdk'

/**
 * Mechanical LLM call. Sends what it is given, returns content and usage.
 * Does not interpret observations, choose a tool, or retry adaptively (ADR-10).
 * Model id and temperature come from the caller, who reads them from the
 * shared run configuration.
 *
 * Transport is OpenRouter's Anthropic-compatible Messages API
 * (`https://openrouter.ai/api`), authenticated with OPENROUTER_API_KEY.
 * Message and tool shapes stay Anthropic's so the agent loop does not rewrite
 * tool_use / tool_result.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api'

const TEN_MINUTES_MS = 10 * 60 * 1000

/**
 * The SDK refuses a non-streaming request whose *estimated* duration exceeds ten
 * minutes — its estimate is 60 minutes at 128k output tokens — unless the client
 * carries an explicit timeout. Raising the output ceiling to 32k (ADR-17) crosses
 * that line at 15 minutes.
 *
 * We set the timeout the SDK would have computed rather than lowering a ceiling
 * the document genuinely needs: the whole reconstruction leaves the model as one
 * argument. Same formula, same number, applied instead of thrown — and derived
 * from the shared `maxTokens`, so it is identical for both systems without a new
 * configuration field.
 *
 * Streaming is the more robust answer if a scored run ever approaches this bound.
 */
export function nonstreamingTimeoutMs(maxTokens: number): number {
  return Math.max(TEN_MINUTES_MS, Math.ceil((60 * 60 * 1000 * maxTokens) / 128_000))
}

/**
 * Prompt caching (`cache_control`) is Anthropic-native. OpenRouter's
 * Anthropic-compatible endpoint ("Anthropic Skin") passes it straight through
 * when the underlying model is a Claude model served by Anthropic, Bedrock, or
 * Vertex; a non-Anthropic model on the same endpoint (deepseek and friends —
 * used for cheap smoke tests via config/run.local.json) has no such mechanism,
 * and nothing here assumes OpenRouter strips an unsupported field gracefully.
 * Mechanical string check on the model id, not a strategy decision (ADR-10):
 * it decides transport capability, not agent behavior.
 */
export function supportsPromptCaching(modelId: string): boolean {
  return modelId.startsWith('anthropic/')
}

export interface ChatTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export interface ChatRequest {
  model: string
  temperature: number
  system: string
  tools: ChatTool[]
  messages: Anthropic.MessageParam[]
  /** Per-call output ceiling. Comes from the shared run configuration (ADR-17). */
  maxTokens?: number
  /**
   * Marks a cache breakpoint at the end of `system` (which, by Anthropic's
   * tools→system→messages cache ordering, also covers `tools` before it — both
   * are byte-identical for the whole run). Combined with `cacheLastMessage`
   * (default true) that is two breakpoints, under Anthropic's cap of four.
   * Caller decides via `supportsPromptCaching(model)` — this flag does not
   * itself know which models support it (ADR-10: mechanics, not strategy).
   */
  enableCaching?: boolean
  /**
   * When `enableCaching` is set, also mark a rolling breakpoint on the last
   * message's last content block so the growing conversation prefix is a cache
   * read on later turns. Default true. One-shot callers (extractors, inquisitor)
   * pass false: their unique suffix is never re-read, and writing it at the
   * cache-write tariff would cost more than a plain input token.
   */
  cacheLastMessage?: boolean
  /**
   * Groups every call of one run under one trace in the OpenRouter dashboard
   * (their `x-session-id` header, up to 128 chars) -- unlike `enableCaching`
   * this is not model-specific: it is read by OpenRouter's own gateway, not
   * forwarded into the per-model request body, so it is safe to send for any
   * model behind OpenRouter without a support check.
   */
  sessionId?: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  /** Tokens written to a new cache entry this call (billed ~1.25x prompt price for the 5m TTL used here). 0 when caching is off. */
  cache_creation_input_tokens?: number
  /** Tokens served from an existing cache entry this call (billed ~0.1x prompt price). 0 when caching is off. */
  cache_read_input_tokens?: number
}

export interface ChatResponse {
  content: Anthropic.ContentBlock[]
  usage: TokenUsage
  stop_reason: string | null
}

/** OpenRouter list prices are USD per token, as strings on GET /api/v1/models. */
export interface TokenPrices {
  prompt: number
  completion: number
  /** USD/token for a cache read. Falls back to 0.1x `prompt` (Anthropic's published multiplier) if the catalog entry does not carry it. */
  cacheRead?: number
  /** USD/token for a cache write at the 5-minute TTL (the only TTL this codebase requests). Falls back to 1.25x `prompt`. */
  cacheWrite?: number
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const MODELS_FETCH_TIMEOUT_MS = 15_000

let catalogCache: Map<string, unknown> | undefined

export function costFromTokenPrices(prices: TokenPrices, usage: TokenUsage): number {
  const cacheRead = prices.cacheRead ?? prices.prompt * 0.1
  const cacheWrite = prices.cacheWrite ?? prices.prompt * 1.25
  return (
    usage.input_tokens * prices.prompt +
    usage.output_tokens * prices.completion +
    (usage.cache_read_input_tokens ?? 0) * cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * cacheWrite
  )
}

export function pricesFromOpenRouterModel(model: unknown): TokenPrices {
  if (!model || typeof model !== 'object') {
    throw new Error('OpenRouter model entry is not an object')
  }
  const pricing = (model as { pricing?: unknown }).pricing
  if (!pricing || typeof pricing !== 'object') {
    throw new Error('OpenRouter model entry has no pricing')
  }
  const p = pricing as Record<string, unknown>
  const prompt = Number(p.prompt)
  const completion = Number(p.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) {
    throw new Error('OpenRouter model pricing is not numeric')
  }
  // Cache prices are not published for every catalog entry. `input_cache_read`
  // / `input_cache_write` are the field names OpenRouter has been observed to
  // use when they are present — not confirmed against a written spec, so treat
  // this as best-effort and cross-check against a real run's OpenRouter
  // dashboard "Cache" column if a cost number here ever looks off. Missing or
  // non-numeric falls back to Anthropic's published multipliers in
  // costFromTokenPrices rather than throwing, since most catalog entries won't
  // carry these fields at all.
  const cacheReadRaw = Number(p.input_cache_read)
  const cacheWriteRaw = Number(p.input_cache_write)
  return {
    prompt,
    completion,
    cacheRead: Number.isFinite(cacheReadRaw) ? cacheReadRaw : undefined,
    cacheWrite: Number.isFinite(cacheWriteRaw) ? cacheWriteRaw : undefined,
  }
}

export function lookupOpenRouterPrices(catalog: Map<string, unknown>, modelId: string): TokenPrices {
  const entry = catalog.get(modelId)
  if (!entry) {
    throw new Error(`OpenRouter models catalog has no prices for ${modelId}`)
  }
  return pricesFromOpenRouterModel(entry)
}

async function fetchOpenRouterCatalog(): Promise<Map<string, unknown>> {
  if (catalogCache) return catalogCache
  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers,
    signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`OpenRouter models catalog returned ${response.status} ${response.statusText}`)
  }
  const body = (await response.json()) as { data?: unknown }
  if (!Array.isArray(body.data)) {
    throw new Error('OpenRouter models catalog is missing data[]')
  }
  const catalog = new Map<string, unknown>()
  for (const entry of body.data) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: unknown }).id
    if (typeof id === 'string') catalog.set(id, entry)
  }
  catalogCache = catalog
  return catalog
}

/**
 * List-price estimate from OpenRouter's live catalog (GET /api/v1/models).
 * Standard / uncached rates; not the billed generation record.
 */
export async function estimateCostUsd(model: string, usage: TokenUsage): Promise<number> {
  return costFromTokenPrices(lookupOpenRouterPrices(await fetchOpenRouterCatalog(), model), usage)
}

const EPHEMERAL_CACHE = { type: 'ephemeral' as const }

export type CachedSystem =
  | string
  | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>

/** Adds a cache breakpoint at the end of a message's content (or wraps a bare string so it can carry one). */
function withCacheBreakpoint(content: Anthropic.MessageParam['content']): Anthropic.MessageParam['content'] {
  if (typeof content === 'string') {
    return content.length === 0 ? content : [{ type: 'text', text: content, cache_control: EPHEMERAL_CACHE }]
  }
  if (content.length === 0) return content
  const blocks = content.slice()
  const lastIndex = blocks.length - 1
  const last = blocks[lastIndex]
  if (last === undefined) return blocks
  blocks[lastIndex] = { ...last, cache_control: EPHEMERAL_CACHE } as typeof last
  return blocks
}

/**
 * Shapes `system` and `messages` for Anthropic prompt caching. Pure: does not
 * call the network. One-shot callers pass `cacheLastMessage: false` so only the
 * shared prefix is marked.
 */
export function applyPromptCaching(input: {
  system: string
  messages: Anthropic.MessageParam[]
  enableCaching?: boolean
  cacheLastMessage?: boolean
}): { system: CachedSystem; messages: Anthropic.MessageParam[] } {
  if (!input.enableCaching) {
    return { system: input.system, messages: input.messages }
  }
  const system: CachedSystem = [{ type: 'text', text: input.system, cache_control: EPHEMERAL_CACHE }]
  if (input.cacheLastMessage === false) {
    return { system, messages: input.messages }
  }
  const messages = input.messages.map((message, index) =>
    index === input.messages.length - 1
      ? { ...message, content: withCacheBreakpoint(message.content) }
      : message,
  )
  return { system, messages }
}

export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and fill it in, or export the key yourself.',
    )
  }
  const maxTokens = request.maxTokens ?? 32_000
  const client = new Anthropic({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    timeout: nonstreamingTimeoutMs(maxTokens),
  })

  const { system, messages } = applyPromptCaching(request)

  const response = await client.messages.create(
    {
      model: request.model,
      temperature: request.temperature,
      max_tokens: maxTokens,
      system,
      ...(request.tools.length > 0 ? { tools: request.tools } : {}),
      messages,
    },
    request.sessionId ? { headers: { 'x-session-id': request.sessionId } } : undefined,
  )
  return {
    content: response.content,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
    stop_reason: response.stop_reason,
  }
}
