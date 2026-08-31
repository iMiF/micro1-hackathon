import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv, { type ValidateFunction } from 'ajv'
import type Anthropic from '@anthropic-ai/sdk'
import {
  assembleAgentContext,
  assembledSystem,
  assertIsolated,
  loadPublicSchema,
  loadPublicVocabulary,
} from '../../tooling/isolation/context.js'
import { chat, estimateCostUsd, supportsPromptCaching, type TokenUsage } from '../../tooling/llm/client.js'
import { recoverSubmission } from '../../tooling/reconstruction/recover.js'
import type { RunConfig } from '../../tooling/config/run.js'
import { canonicalKey, type Section } from './canonical.js'
import { sanitizeOperationDisplay } from './display.js'
import type { ClaimEntry } from './boards.js'
import { addUsage } from './explore.js'

/**
 * Per-section extractors. Nine calls, digest as the cached system prefix,
 * section contract as the suffix. The first job runs alone so its system
 * prefix is in the prompt cache before the rest go out at `concurrency`.
 * An unparseable section is retried once, then dropped.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

export const EXTRACTOR_JOBS: Array<{
  id: string
  promptFile: string
  section: Section
  definition: string
  producedBy: string
  kinds?: string[]
}> = [
  { id: 'operations', promptFile: 'extract-operations.md', section: 'operations', definition: 'operation', producedBy: 'extract:operations' },
  { id: 'enums', promptFile: 'extract-enums.md', section: 'semantic_facts', definition: 'semanticFact', producedBy: 'extract:enums', kinds: ['enum_mapping', 'identifier_meaning'] },
  { id: 'transitions', promptFile: 'extract-transitions.md', section: 'semantic_facts', definition: 'semanticFact', producedBy: 'extract:transitions', kinds: ['state_transition', 'concurrency'] },
  { id: 'validation', promptFile: 'extract-validation.md', section: 'semantic_facts', definition: 'semanticFact', producedBy: 'extract:validation', kinds: ['validation', 'auth'] },
  { id: 'constraints', promptFile: 'extract-constraints.md', section: 'semantic_facts', definition: 'semanticFact', producedBy: 'extract:constraints', kinds: ['business_constraint'] },
  { id: 'query', promptFile: 'extract-query.md', section: 'semantic_facts', definition: 'semanticFact', producedBy: 'extract:query', kinds: ['query_semantics', 'derived_value'] },
  { id: 'dependencies', promptFile: 'extract-dependencies.md', section: 'dependencies', definition: 'dependency', producedBy: 'extract:dependencies' },
  { id: 'workflows', promptFile: 'extract-workflows.md', section: 'workflows', definition: 'workflow', producedBy: 'extract:workflows' },
  { id: 'claims', promptFile: 'extract-claims.md', section: 'claims', definition: 'claim', producedBy: 'extract:claims' },
]

const PREAMBLE = `You extract one section of an API reconstruction from an evidence digest.
Return a JSON array and nothing else. No markdown fences unless the array is inside one.

Rules, without exception:
- One atomic fact per entry. n distinguishable values → n entries.
- The value shape comes from the published schema fragment in the user message. Use those keys, not prose.
- No entry without a non-empty evidence array. Allowed evidence kinds: network_request, network_response, ui_label, ui_control, ui_action, cookie, header.
- Only what was observed. Not what a CRM usually does.
- Omit id; ids are assigned later.
- Do not cite source code.`

export interface ExtractorRecord {
  id: string
  ok: boolean
  dropped: Array<{ reason: string; item?: unknown }>
  parseError?: string
  retried: boolean
}

export interface ExtractResult {
  claims: ClaimEntry[]
  records: ExtractorRecord[]
  usage: TokenUsage
}

export async function runExtractors(input: {
  digestJson: string
  config: RunConfig
  root?: string
  round: number
  concurrency: number
  log?: (line: string) => void
  sessionId?: string
  usage?: TokenUsage
  jobs?: typeof EXTRACTOR_JOBS
}): Promise<ExtractResult> {
  const root = input.root ?? process.cwd()
  const log = input.log ?? console.log
  const usage: TokenUsage = input.usage ?? {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const jobs = input.jobs ?? EXTRACTOR_JOBS
  const schemaText = loadPublicSchema(root)
  const schema = JSON.parse(schemaText) as { definitions?: Record<string, unknown>; $id?: string }
  const validators = compileValidators(schema)
  const vocab = loadPublicVocabulary(root)
  const records: ExtractorRecord[] = []
  const claims: ClaimEntry[] = []

  const runJob = async (job: (typeof EXTRACTOR_JOBS)[number]) => {
    const result = await runOneExtractor({
      job,
      digestJson: input.digestJson,
      schemaText,
      schema,
      vocab,
      validator: validators.get(job.definition),
      config: input.config,
      root,
      round: input.round,
      sessionId: input.sessionId,
      usage,
      log,
    })
    records.push(result.record)
    claims.push(...result.claims)
  }

  const warmup = jobs[0]
  const rest = jobs.slice(1)
  if (warmup !== undefined) await runJob(warmup)
  await mapPool(rest, input.concurrency, runJob)

  records.sort((a, b) => a.id.localeCompare(b.id))
  return { claims, records, usage }
}

async function runOneExtractor(input: {
  job: (typeof EXTRACTOR_JOBS)[number]
  digestJson: string
  schemaText: string
  schema: { definitions?: Record<string, unknown> }
  vocab: string
  validator?: ValidateFunction
  config: RunConfig
  root: string
  round: number
  sessionId?: string
  usage: TokenUsage
  log: (line: string) => void
}): Promise<{ claims: ClaimEntry[]; record: ExtractorRecord }> {
  const prompt = readFileSync(join(HERE, 'prompts', input.job.promptFile), 'utf8').trim()
  const fragment = schemaFragment(input.schema, input.job)
  const suffix = [prompt, '', '## Schema fragment (published contract)', fragment].join('\n')
  const maxCostUsd = input.config.budgets.maxCostUsd

  const attempt = async (retryNote: string | null) => {
    if (maxCostUsd != null) {
      const cost = await estimateCostUsd(input.config.model.id, input.usage)
      if (cost >= maxCostUsd) {
        throw new Error('cost budget exceeded')
      }
    }
    const user = retryNote ? `${suffix}\n\nPrevious output failed to parse:\n${retryNote}\nReturn a JSON array.` : suffix
    const ctx = assembleAgentContext({
      systemPrompt: `${PREAMBLE}\n\n## Evidence digest\n${input.digestJson}`,
      taskPrompt: user,
      publicSchema: input.schemaText,
      publicVocabulary: input.vocab,
    })
    ctx.conversation = [{ role: 'user', content: user }]
    assertIsolated(ctx, input.config.isolation.deny, input.root)
    const response = await chat({
      model: input.config.model.id,
      temperature: input.config.model.temperature,
      system: assembledSystem(ctx),
      tools: [],
      messages: [{ role: 'user', content: user }],
      maxTokens: input.config.model.maxTokens,
      enableCaching: supportsPromptCaching(input.config.model.id),
      cacheLastMessage: false,
      sessionId: input.sessionId,
    })
    addUsage(input.usage, response.usage)
    return textOf(response.content)
  }

  input.log(`extract ${input.job.id}`)
  let text: string
  try {
    text = await attempt(null)
  } catch (error) {
    return {
      claims: [],
      record: {
        id: input.job.id,
        ok: false,
        dropped: [],
        parseError: error instanceof Error ? error.message : String(error),
        retried: false,
      },
    }
  }

  let parsed = parseJsonArray(text)
  let retried = false
  if (!parsed.ok) {
    retried = true
    try {
      text = await attempt(parsed.error)
      parsed = parseJsonArray(text)
    } catch (error) {
      return {
        claims: [],
        record: {
          id: input.job.id,
          ok: false,
          dropped: [],
          parseError: error instanceof Error ? error.message : String(error),
          retried: true,
        },
      }
    }
  }

  if (!parsed.ok) {
    input.log(`extract ${input.job.id}: unparseable after retry — dropping section`)
    return {
      claims: [],
      record: { id: input.job.id, ok: false, dropped: [], parseError: parsed.error, retried },
    }
  }

  const dropped: ExtractorRecord['dropped'] = []
  const claims: ClaimEntry[] = []
  for (const raw of parsed.items) {
    const item = asItem(raw)
    if (!item) {
      dropped.push({ reason: 'not an object', item: raw })
      continue
    }
    delete item.id
    if (input.job.section === 'operations') sanitizeOperationDisplay(item)
    if (input.job.kinds && typeof item.kind === 'string' && !input.job.kinds.includes(item.kind)) {
      dropped.push({ reason: `kind ${item.kind} not in ${input.job.kinds.join(',')}`, item })
      continue
    }
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      dropped.push({ reason: 'missing or empty evidence', item })
      continue
    }
    const withId = { ...item, id: 'tmp' }
    if (input.validator && !input.validator(withId)) {
      dropped.push({
        reason: (input.validator.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ') || 'schema',
        item,
      })
      continue
    }
    const key = canonicalKey(input.job.section, item)
    if (!key) {
      dropped.push({ reason: 'no canonical key', item })
      continue
    }
    claims.push({
      section: input.job.section,
      canonicalKey: key,
      item,
      evidenceIds: evidenceIdsFrom(item.evidence),
      producedBy: input.job.producedBy,
      support: 'observed',
      round: input.round,
    })
  }

  return {
    claims,
    record: { id: input.job.id, ok: true, dropped, retried },
  }
}

export function parseJsonArray(text: string): { ok: true; items: unknown[] } | { ok: false; error: string } {
  const recovered = recoverSubmission({ reconstruction: undefined }, text)
  const sliced = jsonArraySlice(text)
  for (const candidate of [recovered, sliced !== undefined ? tryParse(sliced) : undefined, tryParse(text)]) {
    if (Array.isArray(candidate)) return { ok: true, items: candidate }
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>
      for (const key of ['operations', 'semantic_facts', 'dependencies', 'workflows', 'claims', 'items']) {
        if (Array.isArray(record[key])) return { ok: true, items: record[key] as unknown[] }
      }
    }
  }
  return { ok: false, error: text.slice(0, 500) }
}

function jsonArraySlice(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] ?? text : text
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start < 0 || end <= start) return undefined
  return body.slice(start, end + 1)
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function compileValidators(schema: { definitions?: Record<string, unknown> }): Map<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const map = new Map<string, ValidateFunction>()
  const definitions = schema.definitions ?? {}
  for (const name of new Set(EXTRACTOR_JOBS.map((j) => j.definition))) {
    const def = definitions[name]
    if (!def) continue
    map.set(name, ajv.compile({ ...(def as object), definitions }))
  }
  return map
}

function schemaFragment(schema: { definitions?: Record<string, unknown> }, job: (typeof EXTRACTOR_JOBS)[number]): string {
  const definitions = schema.definitions ?? {}
  const picked: Record<string, unknown> = {}
  const need = new Set(['evidence', 'evidenceList', 'semanticFactValue', job.definition])
  if (job.definition === 'operation') {
    need.add('parameter')
    need.add('errorResponse')
    need.add('jsonSchema')
  }
  if (job.definition === 'workflow') need.add('workflowStep')
  if (job.definition === 'semanticFact') need.add('semanticFactValue')
  for (const name of need) {
    if (definitions[name] !== undefined) picked[name] = definitions[name]
  }
  return JSON.stringify({ definitions: picked }, null, 2)
}

function asItem(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return { ...(value as Record<string, unknown>) }
}

function evidenceIdsFrom(evidence: unknown): string[] {
  if (!Array.isArray(evidence) || evidence.length === 0) return ['digest']
  const ids: string[] = []
  for (const row of evidence) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    if (typeof rec.note === 'string' && /^ev_\d+/.test(rec.note)) ids.push(rec.note)
  }
  return ids.length > 0 ? ids : ['digest']
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i
      i += 1
      const item = items[idx]
      if (item === undefined) return
      await fn(item)
    }
  })
  await Promise.all(workers)
}
