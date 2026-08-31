import { readFileSync } from 'node:fs'
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
import { chat, type TokenUsage } from '../../tooling/llm/client.js'
import {
  asRecord,
  describeSubmitPayload,
  looksLikeReconstruction,
  recoverSubmission,
  salvageSubmission,
} from '../../tooling/reconstruction/recover.js'
import { SubmissionValidator, VALIDATION_RETRIES } from '../../tooling/reconstruction/validate.js'
import { operationKey } from '../../tooling/browser/paths.js'

/**
 * The baseline loop: observe → hypothesize → act → check observations → record.
 * Memory is the message list. No planner, ledger, or verifier (ADR-3, ADR-10).
 */

const HERE = dirname(fileURLToPath(import.meta.url))

export function loadSystemPrompt(): string {
  return readFileSync(join(HERE, 'system-prompt.md'), 'utf8').trim()
}

export interface BaselineRun {
  usage: TokenUsage
  validationRetriesUsed: number
}

export async function runBaseline(input: {
  harness: Harness
  config: RunConfig
  root?: string
  log?: (line: string) => void
}): Promise<BaselineRun> {
  const root = input.root ?? process.cwd()
  const log = input.log ?? console.log
  const { harness, config } = input

  const taskPrompt = renderTaskPrompt(config, root)
  const ctx: AssembledContext = assembleAgentContext({
    systemPrompt: loadSystemPrompt(),
    taskPrompt,
    publicSchema: loadPublicSchema(root),
    publicVocabulary: loadPublicVocabulary(root),
  })

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: taskPrompt }]
  const validator = new SubmissionValidator(
    join(root, 'miniCRM/benchmark/schemas/reconstruction-output.schema.json'),
  )
  const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 }
  let validationRetriesLeft = VALIDATION_RETRIES
  let validationRetriesUsed = 0
  let lastAttempt: unknown
  /** Raw material of the most recent submit call, kept whether or not it parsed. */
  let lastRaw: { input: unknown; text: string } | undefined

  while (!harness.isFinished()) {
    ctx.conversation = messages
    assertIsolated(ctx, config.isolation.deny, root)

    const response = await chat({
      model: config.model.id,
      temperature: config.model.temperature,
      system: assembledSystem(ctx),
      tools: TOOL_DEFINITIONS,
      messages,
      maxTokens: config.model.maxTokens,
    })
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens

    const toolUses = response.content.filter((block) => block.type === 'tool_use')
    if (toolUses.length === 0) {
      messages.push({ role: 'assistant', content: response.content })
      const nudge =
        harness.budgetLeft() <= 3
          ? 'The tool-call budget is nearly exhausted. Call submit_reconstruction with the reconstruction you have.'
          : 'Continue by calling a tool. If you are ready to finish, call submit_reconstruction.'
      messages.push({ role: 'user', content: nudge })
      continue
    }

    messages.push({ role: 'assistant', content: response.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    const siblingText = textOf(response.content)

    for (const block of toolUses) {
      if (block.type !== 'tool_use') continue
      log(`tool ${block.name} ${summarizeArgs(block.input)} (budget ${harness.budgetLeft()})`)
      if (block.name === 'submit_reconstruction') {
        // Diagnostics for the one call that decides whether the run scores at
        // all. An empty `input` with stop_reason=max_tokens is a generation cut
        // off mid-JSON; an empty one that stopped normally is the model failing
        // to fill a free-form object argument. The two need different fixes and
        // are indistinguishable without this line.
        log(
          `  submit payload: ${describeSubmitPayload(block.input, siblingText)} stop_reason=${response.stop_reason ?? 'null'}`,
        )
        lastRaw = { input: block.input, text: siblingText }
      }
      const result = await dispatchTool({
        harness,
        validator,
        name: block.name,
        input: block.input,
        siblingText,
        rememberAttempt: (value) => {
          lastAttempt = value
        },
        getRetriesLeft: () => validationRetriesLeft,
        consumeRetry: () => {
          validationRetriesLeft -= 1
          validationRetriesUsed += 1
        },
        log,
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

  if (harness.getSubmission() == null) {
    // `lastAttempt` is only set once recovery has already succeeded, so before
    // ADR-17 this net could only catch the case where it was not needed: a
    // submit whose argument could not be read at all left the run with nothing
    // stored, and a zero where a partial score was available. Salvage works
    // from the raw material instead.
    const recovered =
      lastAttempt !== undefined ? lastAttempt : salvageSubmission(lastRaw?.input, lastRaw?.text ?? '')
    if (recovered !== undefined) {
      const how = lastAttempt !== undefined ? 'last reconstruction attempt' : 'salvaged reconstruction'
      log(`loop ended without a stored submission; submitting ${how}`)
      await harness.submit_reconstruction(validator.check(recovered).normalized)
    } else {
      log('loop ended with nothing to submit: no reconstruction could be recovered from the final turn')
    }
  }

  return { usage, validationRetriesUsed }
}

async function dispatchTool(input: {
  harness: Harness
  validator: SubmissionValidator
  name: string
  input: unknown
  siblingText?: string
  rememberAttempt?: (value: unknown) => void
  getRetriesLeft: () => number
  consumeRetry: () => void
  log: (line: string) => void
}): Promise<ToolResult> {
  const args = asRecord(input.input)

  switch (input.name) {
    case 'observe_page':
      return input.harness.observe_page()
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
      return submitWithValidation(input, recoverSubmission(input.input, input.siblingText))
    default:
      return { ok: false, error: `unknown tool ${input.name}` }
  }
}

/**
 * Validate before the harness call. submit_reconstruction sets finished=true
 * and cannot be retried after that. Equal retry count, no semantic rewrite (ADR-12).
 */
function submitWithValidation(
  input: {
    harness: Harness
    validator: SubmissionValidator
    rememberAttempt?: (value: unknown) => void
    getRetriesLeft: () => number
    consumeRetry: () => void
    log: (line: string) => void
  },
  reconstruction: unknown,
): Promise<ToolResult> {
  if (reconstruction !== undefined) input.rememberAttempt?.(reconstruction)
  const checked = input.validator.check(reconstruction)
  if (checked.valid) {
    input.log('submit_reconstruction: schema valid')
    return input.harness.submit_reconstruction(checked.normalized)
  }
  if (input.getRetriesLeft() > 0) {
    input.consumeRetry()
    input.log(`submit_reconstruction: invalid, ${input.getRetriesLeft()} retries left`)
    return Promise.resolve({
      ok: false,
      error: 'schema validation failed',
      errors: checked.errors,
      retries_left: input.getRetriesLeft(),
    })
  }
  input.log('submit_reconstruction: retries exhausted, submitting last attempt')
  return input.harness.submit_reconstruction(checked.normalized)
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

/** Operator log only. Uses the shared key; does not rewrite the submission. */
function logToolNetwork(log: (line: string) => void, name: string, result: ToolResult): void {
  if (name !== 'get_network_events' || !Array.isArray(result.events)) return
  for (const event of result.events) {
    const row = asRecord(event)
    const method = typeof row.method === 'string' ? row.method : '?'
    const raw = typeof row.rawPath === 'string' ? row.rawPath : typeof row.path === 'string' ? row.path : ''
    log(`  ${operationKey(method, raw)} -> ${row.status ?? '?'}`)
  }
}

/** Exported for selftest: the task prompt the loop sends is this, unwrapped. */
export function taskPromptFor(config: RunConfig, root = process.cwd()): string {
  return renderTaskPrompt(config, root)
}

