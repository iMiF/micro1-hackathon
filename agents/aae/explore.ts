import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Anthropic from '@anthropic-ai/sdk'
import { Harness, TOOL_DEFINITIONS, type ToolResult } from '../../harness/index.js'
import { renderTaskPrompt, type RunConfig } from '../../tooling/config/run.js'
import {
  assembleAgentContext,
  assembledSystem,
  assertIsolated,
  loadPublicSchema,
  loadPublicVocabulary,
  type AssembledContext,
} from '../../tooling/isolation/context.js'
import { chat, estimateCostUsd, supportsPromptCaching, type TokenUsage } from '../../tooling/llm/client.js'
import { asRecord, describeSubmitPayload, looksLikeReconstruction } from '../../tooling/reconstruction/recover.js'
import { operationKey } from '../../tooling/browser/paths.js'
import type { PageSnapshot } from './digest.js'

/**
 * Explorer: the baseline loop with three changes — never submits (unless
 * extractors are ablated), stops on the round allotment, and round two can
 * carry a mission in a scaffolding message.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

export function loadExplorerPrompt(): string {
  return readFileSync(join(HERE, 'prompts', 'explorer.md'), 'utf8').trim()
}

export const INTERCEPT_MESSAGE =
  'submit_reconstruction is intercepted: the document is assembled at the end of the run from the evidence store. Continue exploring.'

export interface ExploreRound {
  usage: TokenUsage
  pages: PageSnapshot[]
  interceptedSubmits: number
  stoppedOnNoTools: boolean
}

export async function runExplorer(input: {
  harness: Harness
  config: RunConfig
  root?: string
  log?: (line: string) => void
  sessionId?: string
  /** Inclusive step count at which this round must stop (harness.stepsUsed()). */
  stopAtSteps: number
  interceptSubmit: boolean
  mission?: string
  runDir?: string
  pages?: PageSnapshot[]
  usage?: TokenUsage
  costSoFar?: number
}): Promise<ExploreRound> {
  const root = input.root ?? process.cwd()
  const log = input.log ?? console.log
  const { harness, config, sessionId } = input
  const pages = input.pages ?? []
  const usage: TokenUsage = input.usage ?? {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  const taskPrompt = renderTaskPrompt(config, root)
  const ctx: AssembledContext = assembleAgentContext({
    systemPrompt: loadExplorerPrompt(),
    taskPrompt,
    publicSchema: loadPublicSchema(root),
    publicVocabulary: loadPublicVocabulary(root),
  })

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: taskPrompt }]
  if (input.mission && input.mission.trim().length > 0) {
    messages.push({ role: 'user', content: input.mission.trim() })
  }

  const enableCaching = supportsPromptCaching(config.model.id)
  const maxCostUsd = config.budgets.maxCostUsd
  let costSoFar = input.costSoFar ?? 0
  let interceptedSubmits = 0
  let stoppedOnNoTools = false

  while (!harness.isFinished() && harness.stepsUsed() < input.stopAtSteps) {
    if (maxCostUsd != null && costSoFar >= maxCostUsd) {
      log(`cost budget exceeded: $${costSoFar.toFixed(4)} >= $${maxCostUsd} -- stopping explorer`)
      break
    }

    ctx.conversation = messages
    assertIsolated(ctx, config.isolation.deny, root)

    const response = await chat({
      model: config.model.id,
      temperature: config.model.temperature,
      system: assembledSystem(ctx),
      tools: TOOL_DEFINITIONS,
      messages,
      maxTokens: config.model.maxTokens,
      enableCaching,
      sessionId,
    })
    addUsage(usage, response.usage)
    if (maxCostUsd != null) {
      costSoFar = await estimateCostUsd(config.model.id, usage)
    }

    const toolUses = response.content.filter((block) => block.type === 'tool_use')
    if (toolUses.length === 0) {
      messages.push({ role: 'assistant', content: response.content })
      stoppedOnNoTools = true
      break
    }

    messages.push({ role: 'assistant', content: response.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    const siblingText = textOf(response.content)

    for (const block of toolUses) {
      if (block.type !== 'tool_use') continue
      if (harness.stepsUsed() >= input.stopAtSteps && block.name !== 'submit_reconstruction') {
        break
      }
      log(`tool ${block.name} ${summarizeArgs(block.input)} (budget ${harness.budgetLeft()})`)
      if (block.name === 'submit_reconstruction') {
        log(`  submit payload: ${describeSubmitPayload(block.input, siblingText)} stop_reason=${response.stop_reason ?? 'null'}`)
      }
      const result = await dispatchExploreTool({
        harness,
        name: block.name,
        input: block.input,
        interceptSubmit: input.interceptSubmit,
        onIntercept: () => {
          interceptedSubmits += 1
          recordIntercept(input.runDir, harness.stepsUsed(), siblingText)
          log('submit_reconstruction intercepted; exploration continues')
        },
        onPage: (snapshot) => pages.push(snapshot),
      })
      logToolNetwork(log, block.name, result)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: result.ok === false,
      })
      if (harness.isFinished()) break
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return { usage, pages, interceptedSubmits, stoppedOnNoTools }
}

export async function dispatchExploreTool(input: {
  harness: Pick<
    Harness,
    'observe_page' | 'click' | 'fill' | 'select' | 'go_back' | 'get_network_events' | 'submit_reconstruction'
  >
  name: string
  input: unknown
  interceptSubmit: boolean
  onIntercept?: () => void
  onPage?: (snapshot: PageSnapshot) => void
}): Promise<ToolResult> {
  if (input.name === 'submit_reconstruction' && input.interceptSubmit) {
    input.onIntercept?.()
    return { ok: true, intercepted: true, error: INTERCEPT_MESSAGE }
  }
  const args = asRecord(input.input)
  switch (input.name) {
    case 'observe_page': {
      const result = await input.harness.observe_page()
      const snapshot = pageSnapshotFrom(result, 0)
      if (snapshot) input.onPage?.(snapshot)
      return result
    }
    case 'click':
      return input.harness.click(String(args.element_id ?? ''))
    case 'fill':
      return input.harness.fill(String(args.element_id ?? ''), String(args.value ?? ''))
    case 'select':
      return input.harness.select(String(args.element_id ?? ''), String(args.value ?? ''))
    case 'go_back':
      return input.harness.go_back()
    case 'get_network_events':
      return input.harness.get_network_events(
        typeof args.since === 'string' && args.since.length > 0 ? args.since : undefined,
      )
    case 'submit_reconstruction':
      return input.harness.submit_reconstruction(asRecord(input.input).reconstruction ?? input.input)
    default:
      return { ok: false, error: `unknown tool ${input.name}` }
  }
}

export function pageSnapshotFrom(result: ToolResult, step: number): PageSnapshot | null {
  const page = asRecord(result.page)
  if (typeof page.path !== 'string' && typeof page.url !== 'string') return null
  const elements = Array.isArray(page.elements) ? page.elements : []
  return {
    step,
    path: typeof page.path === 'string' ? page.path : pathOf(String(page.url ?? '')),
    text: typeof page.text === 'string' ? page.text : '',
    controls: elements.map((el) => {
      const row = asRecord(el)
      return {
        label: typeof row.label === 'string' ? row.label : '',
        role: typeof row.role === 'string' ? row.role : 'other',
        options: Array.isArray(row.options) ? row.options.map(String) : null,
        enabled: row.enabled !== false,
        value: typeof row.value === 'string' ? row.value : null,
      }
    }),
  }
}

function recordIntercept(runDir: string | undefined, step: number, siblingText: string): void {
  if (!runDir) return
  appendFileSync(
    join(runDir, 'trajectory.jsonl'),
    JSON.stringify({
      step,
      tool: 'submit_reconstruction',
      args: {},
      ok: true,
      result: 'intercepted: assembler submits at end of run',
      evidenceIds: [],
      intercepted: true,
      siblingTextBytes: siblingText.length,
    }) + '\n',
  )
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function summarizeArgs(value: unknown): string {
  const args = asRecord(value)
  if (typeof args.element_id === 'string') {
    return args.element_id + (args.value != null ? ` ${JSON.stringify(args.value)}` : '')
  }
  if (args.reconstruction || looksLikeReconstruction(args)) return '(reconstruction)'
  if (typeof args.since === 'string') return `since ${args.since}`
  return ''
}

function logToolNetwork(log: (line: string) => void, name: string, result: ToolResult): void {
  if (name !== 'get_network_events' || !Array.isArray(result.events)) return
  for (const event of result.events) {
    const row = asRecord(event)
    const method = typeof row.method === 'string' ? row.method : '?'
    const raw = typeof row.rawPath === 'string' ? row.rawPath : typeof row.path === 'string' ? row.path : ''
    log(`  ${operationKey(method, raw)} -> ${row.status ?? '?'}`)
  }
}

export function addUsage(into: TokenUsage, add: TokenUsage): void {
  into.input_tokens += add.input_tokens
  into.output_tokens += add.output_tokens
  into.cache_creation_input_tokens = (into.cache_creation_input_tokens ?? 0) + (add.cache_creation_input_tokens ?? 0)
  into.cache_read_input_tokens = (into.cache_read_input_tokens ?? 0) + (add.cache_read_input_tokens ?? 0)
}
