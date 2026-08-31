import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assembleAgentContext,
  assembledSystem,
  assertIsolated,
  loadPublicSchema,
  loadPublicVocabulary,
} from '../../tooling/isolation/context.js'
import { chat, supportsPromptCaching, type TokenUsage } from '../../tooling/llm/client.js'
import type { RunConfig } from '../../tooling/config/run.js'
import type { ClaimEntry, GapEntry } from './boards.js'
import { parseJsonArray } from './extract.js'
import { addUsage } from './explore.js'

/**
 * Inquisitor — the only role that invents a question. Ranking is deterministic:
 * ADR-13 category weight × count of unresolved entries. The model only turns a
 * ranked gap into a concrete action that would make the claim false.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/** Frozen VARS weights (ADR-13). Mirrored, not imported from evaluator/. */
const CATEGORY_WEIGHT: Record<string, number> = {
  operations: 0.15,
  parameters: 0.15,
  semantic_facts: 0.35,
  dependencies: 0.20,
  workflows: 0.15,
  claims: 0.15,
}

const HYPOTHESIS_KINDS = new Set(['business_constraint', 'validation', 'derived_value'])

export interface Experiment {
  gapId: string
  goal: string
  concrete_steps: string[]
  expected_if_true: string
  expected_if_false: string
}

const DESTRUCTIVE_GAP = /delete|cancel|archiv|version|QUOTE_|stale|inactive|refund|draft|OUT_OF_STOCK|409/i

export function rankOpenGaps(gaps: GapEntry[], claims: ClaimEntry[]): GapEntry[] {
  const open = gaps.filter((g) => g.status === 'open' || g.status === 'planned')
  const claimByKey = new Map(claims.map((c) => [c.canonicalKey, c]))
  const scored = open.map((gap) => {
    const section = sectionOf(gap, claimByKey)
    const weight = CATEGORY_WEIGHT[section] ?? 0.15
    return { gap, section, weight }
  })
  const countBySection = new Map<string, number>()
  for (const row of scored) countBySection.set(row.section, (countBySection.get(row.section) ?? 0) + 1)
  scored.sort((a, b) => {
    const sa = gapPriority(a.gap, a.section, a.weight, countBySection)
    const sb = gapPriority(b.gap, b.section, b.weight, countBySection)
    if (sb !== sa) return sb - sa
    return a.gap.id.localeCompare(b.gap.id)
  })
  return scored.map((row) => row.gap)
}

function gapPriority(
  gap: GapEntry,
  section: string,
  weight: number,
  countBySection: Map<string, number>,
): number {
  const base = (countBySection.get(section) ?? 0) * weight
  let boost = 0
  if (DESTRUCTIVE_GAP.test(gap.question)) boost += 10
  if (gap.origin === 'sweeper') boost += 5
  return base + boost
}

export function hypothesisClaims(claims: ClaimEntry[]): ClaimEntry[] {
  return claims.filter((c) => {
    if (c.section !== 'semantic_facts') return false
    if (c.support !== 'observed') return false
    return typeof c.item.kind === 'string' && HYPOTHESIS_KINDS.has(c.item.kind)
  })
}

export function renderMission(experiments: Experiment[]): string {
  if (experiments.length === 0) return ''
  const lines = [
    '## Refutation experiments for this round',
    '',
    'Execute these in order. Each is an action that would make a claim false.',
    'A risk-policy refusal is evidence; do not work around it. Do not submit.',
    '',
  ]
  for (const [i, exp] of experiments.entries()) {
    lines.push(`${i + 1}. ${exp.gapId}: ${exp.goal}`)
    lines.push(`   steps: ${exp.concrete_steps.join(' → ')}`)
    lines.push(`   if true: ${exp.expected_if_true}`)
    lines.push(`   if false: ${exp.expected_if_false}`)
    lines.push('')
  }
  return lines.join('\n')
}

export async function runInquisitor(input: {
  gaps: GapEntry[]
  claims: ClaimEntry[]
  digestJson: string
  config: RunConfig
  root?: string
  maxExperiments: number
  log?: (line: string) => void
  sessionId?: string
  usage?: TokenUsage
}): Promise<{ experiments: Experiment[]; usage: TokenUsage }> {
  const root = input.root ?? process.cwd()
  const log = input.log ?? console.log
  const usage: TokenUsage = input.usage ?? {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const ranked = rankOpenGaps(input.gaps, input.claims)
  const hypotheses = hypothesisClaims(input.claims)
  const payload = {
    maxExperiments: input.maxExperiments,
    rankedGaps: ranked.slice(0, input.maxExperiments * 2).map((g) => ({
      id: g.id,
      origin: g.origin,
      question: g.question,
      status: g.status,
    })),
    hypothesisClaims: hypotheses.slice(0, 24).map((c) => ({
      key: c.canonicalKey,
      kind: c.item.kind,
      subject: c.item.subject,
      support: c.support,
    })),
  }
  const prompt = readFileSync(join(HERE, 'prompts', 'inquisitor.md'), 'utf8').trim()
  const user = [
    prompt,
    '',
    `Return at most ${input.maxExperiments} experiments.`,
    '',
    '## Ranked gaps and hypotheses',
    JSON.stringify(payload, null, 2),
  ].join('\n')

  const ctx = assembleAgentContext({
    systemPrompt: `${prompt}\n\n## Evidence digest\n${input.digestJson}`,
    taskPrompt: user,
    publicSchema: loadPublicSchema(root),
    publicVocabulary: loadPublicVocabulary(root),
  })
  ctx.conversation = [{ role: 'user', content: user }]
  assertIsolated(ctx, input.config.isolation.deny, root)

  log('inquisitor')
  const response = await chat({
    model: input.config.model.id,
    temperature: input.config.model.temperature,
    system: assembledSystem(ctx),
    tools: [],
    messages: [{ role: 'user', content: user }],
    maxTokens: input.config.model.maxTokens,
    enableCaching: supportsPromptCaching(input.config.model.id),
    sessionId: input.sessionId,
  })
  addUsage(usage, response.usage)
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
  const parsed = parseJsonArray(text)
  const experiments: Experiment[] = []
  if (parsed.ok) {
    for (const raw of parsed.items) {
      const exp = asExperiment(raw)
      if (exp) experiments.push(exp)
      if (experiments.length >= input.maxExperiments) break
    }
  } else {
    log(`inquisitor: unparseable output, continuing with no experiments`)
  }
  return { experiments, usage }
}

function sectionOf(gap: GapEntry, claims: Map<string, ClaimEntry>): string {
  if (gap.targetClaimKey) {
    const claim = claims.get(gap.targetClaimKey)
    if (claim) return claim.section
  }
  if (gap.origin === 'sweeper' || gap.origin === 'miner' || gap.origin === 'claim') return 'semantic_facts'
  return 'semantic_facts'
}

function asExperiment(value: unknown): Experiment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.gapId !== 'string' || typeof row.goal !== 'string') return null
  const steps = Array.isArray(row.concrete_steps) ? row.concrete_steps.map(String) : []
  return {
    gapId: row.gapId,
    goal: row.goal,
    concrete_steps: steps,
    expected_if_true: typeof row.expected_if_true === 'string' ? row.expected_if_true : '',
    expected_if_false: typeof row.expected_if_false === 'string' ? row.expected_if_false : '',
  }
}
