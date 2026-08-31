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
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
}

export interface ChatResponse {
  content: Anthropic.ContentBlock[]
  usage: TokenUsage
  stop_reason: string | null
}

/**
 * OpenRouter list prices for the slugs in config/run.default.json and
 * config/run.local.json (standard / uncached). Source: openrouter.ai/models.
 * Legacy Anthropic-native ids are kept so an unmigrated overlay still estimates.
 */
export const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'anthropic/claude-opus-4.6': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  // Cheap models for local smoke tests only (config/run.local.json), never the scored config.
  'anthropic/claude-haiku-4.5': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'deepseek/deepseek-chat-v3.1': { input: 0.25, output: 0.95 },
}

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const prices = MODEL_PRICES_USD_PER_MTOK[model]
  if (!prices) {
    throw new Error(`no published price recorded for model ${model}; add it to MODEL_PRICES_USD_PER_MTOK`)
  }
  return (usage.input_tokens * prices.input + usage.output_tokens * prices.output) / 1_000_000
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
  const response = await client.messages.create({
    model: request.model,
    temperature: request.temperature,
    max_tokens: maxTokens,
    system: request.system,
    tools: request.tools,
    messages: request.messages,
  })
  return {
    content: response.content,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    stop_reason: response.stop_reason,
  }
}
