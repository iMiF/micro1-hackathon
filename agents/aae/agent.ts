import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Harness } from '../../harness/index.js'
import type { EvidenceRecord } from '../../tooling/evidence/store.js'
import { validateAaeConfig, type AaeConfig, type RunConfig } from '../../tooling/config/run.js'
import type { TokenUsage } from '../../tooling/llm/client.js'
import { SubmissionValidator } from '../../tooling/reconstruction/validate.js'
import { Boards, claimsBySupport, gapsByStatus, refutationRate, type ClaimEntry } from './boards.js'
import { buildDigest, type PageSnapshot } from './digest.js'
import { runExplorer } from './explore.js'
import { runExtractors, type ExtractorRecord } from './extract.js'
import { assembleFromClaims, submitAssembled } from './assemble.js'
import { mineTraffic } from './miner.js'
import { seedCoverageGaps, sweepDomains } from './sweeper.js'
import { rankOpenGaps, renderMission, runInquisitor, type Experiment } from './inquisitor.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUBMIT_RESERVE = 2

export interface AaeRun {
  usage: TokenUsage
  ablated: string[]
  roundsRun: number
  stepsPerRound: number[]
  claimsBySupport: ReturnType<typeof claimsBySupport>
  gapsByStatus: ReturnType<typeof gapsByStatus>
  refutationRate: number
  extractorRecords: ExtractorRecord[]
  interceptedSubmits: number
}

export function applyAblations(aae: AaeConfig, raw = process.env.AAE_ABLATE ?? ''): {
  aae: AaeConfig
  ablated: string[]
} {
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const next = structuredClone(aae)
  const allowed = new Set(['miner', 'sweeper', 'inquisitor', 'extractors', 'verifier'])
  const ablated: string[] = []
  for (const name of names) {
    if (!allowed.has(name)) continue
    const block = (next as unknown as Record<string, { enabled?: boolean }>)[name]
    if (block && typeof block === 'object' && 'enabled' in block) {
      block.enabled = false
      ablated.push(name)
    }
  }
  return { aae: next, ablated }
}

/**
 * Subdivide the granted step budget. Never exceeds `maxSteps`. Two steps are
 * reserved for the Assembler's submit.
 */
export function computeRoundAllotments(maxSteps: number, split: number[], reserve = SUBMIT_RESERVE): number[] {
  const sum = split.reduce((a, b) => a + b, 0)
  if (sum > 1 + Number.EPSILON) {
    throw new Error(`aae stepBudgetSplit sums to ${sum} > 1.0; refusing to start (ADR-21)`)
  }
  if (maxSteps < reserve) {
    throw new Error(`budgets.maxSteps (${maxSteps}) is smaller than the assembler reserve (${reserve})`)
  }
  const pool = maxSteps - reserve
  const floors = split.map((part) => Math.floor(pool * part))
  const spent = floors.reduce((a, b) => a + b, 0)
  const last = floors.length - 1
  if (last >= 0) floors[last] = (floors[last] ?? 0) + (Math.floor(pool * sum) - spent)
  const total = floors.reduce((a, b) => a + b, 0)
  if (total + reserve > maxSteps) {
    throw new Error(`AAE allotments ${total} plus reserve ${reserve} exceed maxSteps ${maxSteps}`)
  }
  return floors
}

export function loadJsonl<T>(path: string): T[] {
  const text = readFileSync(path, 'utf8')
  if (text.trim() === '') return []
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T)
}

export async function runAae(input: {
  harness: Harness | null
  config: RunConfig
  runDir: string
  root?: string
  log?: (line: string) => void
  sessionId?: string
  evidenceDir?: string
}): Promise<AaeRun> {
  const root = input.root ?? process.cwd()
  const log = input.log ?? console.log
  if (!input.config.aae) {
    throw new Error('run configuration is missing the aae block')
  }
  validateAaeConfig(input.config.aae)
  const { aae, ablated } = applyAblations(input.config.aae)
  const allotments = computeRoundAllotments(input.config.budgets.maxSteps, aae.rounds.stepBudgetSplit)
  const interceptSubmit = aae.extractors.enabled

  copyPrompts(input.runDir)
  const boards = new Boards(input.runDir)
  const pages: PageSnapshot[] = []
  const usage: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const extractorRecords: ExtractorRecord[] = []
  let interceptedSubmits = 0
  let roundsRun = 0
  const stepsPerRound: number[] = []
  let experiments: Experiment[] = []
  let claimsBeforeRound = 0

  const evidenceDir = input.evidenceDir ?? process.env.AAE_FROM_EVIDENCE
  const reassembleFrom = process.env.AAE_REASSEMBLE_CLAIMS
  const offline = Boolean(evidenceDir) || Boolean(reassembleFrom) || input.harness == null

  if (reassembleFrom) {
    log(`reassemble claims from ${reassembleFrom}`)
    const existing = loadJsonl<ClaimEntry>(join(reassembleFrom, 'claims.jsonl'))
    for (const claim of existing) boards.addClaim(claim)
    roundsRun = 0
    stepsPerRound.push(0)
  } else if (!offline && input.harness) {
    let cumulative = 0
    for (let i = 0; i < aae.rounds.max; i += 1) {
      const allotment = allotments[i] ?? 0
      if (allotment <= 0) break
      if (i > 0 && boards.claims.length - claimsBeforeRound < aae.rounds.stopWhenNewClaimsBelow) {
        log(`stopping before round ${i + 1}: new claims ${boards.claims.length - claimsBeforeRound} < ${aae.rounds.stopWhenNewClaimsBelow}`)
        break
      }
      claimsBeforeRound = boards.claims.length
      cumulative += allotment
      const stepsAtStart = input.harness.stepsUsed()
      log(`explorer round ${i + 1} stopAt=${cumulative}`)
      const mission = i > 0 ? renderMission(experiments) : undefined
      const explored = await runExplorer({
        harness: input.harness,
        config: input.config,
        root,
        log,
        sessionId: input.sessionId,
        stopAtSteps: cumulative,
        interceptSubmit,
        mission,
        runDir: input.runDir,
        pages,
        usage,
      })
      interceptedSubmits += explored.interceptedSubmits
      roundsRun += 1
      stepsPerRound.push(input.harness.stepsUsed() - stepsAtStart)

      if (i > 0) {
        for (const gap of boards.gaps) {
          if (gap.status === 'planned') gap.status = 'attempted'
        }
      }

      const evidence = loadRunEvidence(input.runDir)
      persistPages(input.runDir, pages)
      await ingestRound({
        boards,
        evidence,
        pages,
        aae,
        config: input.config,
        root,
        runDir: input.runDir,
        round: i + 1,
        log,
        sessionId: input.sessionId,
        usage,
        extractorRecords,
        wantExperiments: aae.inquisitor.enabled && i + 1 < aae.rounds.max,
        onExperiments: (next) => {
          experiments = next
        },
      })
    }
  } else {
    const from = evidenceDir ?? input.runDir
    log(`offline extract from ${from}`)
    const evidence = loadRunEvidence(from)
    const loadedPages = loadPages(from)
    pages.push(...loadedPages)
    roundsRun = 1
    stepsPerRound.push(0)
    await ingestRound({
      boards,
      evidence,
      pages,
      aae,
      config: input.config,
      root,
      runDir: input.runDir,
      round: 1,
      log,
      sessionId: input.sessionId,
      usage,
      extractorRecords,
      wantExperiments: false,
      onExperiments: () => undefined,
    })
  }

  const evidence = loadRunEvidence(reassembleFrom ?? evidenceDir ?? input.runDir)
  const validator = new SubmissionValidator(
    join(root, 'miniCRM/benchmark/schemas/reconstruction-output.schema.json'),
  )
  const assembled = assembleFromClaims({
    claims: boards.claims,
    nextGapId: boards.nextGapSeq(),
    evidence,
    validator,
  })
  for (const gap of assembled.conflicts) boards.addGap(gap)
  writeFileSync(join(input.runDir, 'assemble-log.json'), JSON.stringify({ dropped: assembled.dropped, retried: assembled.retried }, null, 2) + '\n')

  if (input.harness && !offline) {
    if (interceptSubmit || input.harness.getSubmission() == null) {
      log('assembler submitting reconstruction')
      await submitAssembled(input.harness, assembled.document)
    }
  } else {
    writeFileSync(join(input.runDir, 'reconstruction.json'), JSON.stringify(assembled.document, null, 2) + '\n')
  }

  return {
    usage,
    ablated,
    roundsRun,
    stepsPerRound,
    claimsBySupport: claimsBySupport(boards.claims),
    gapsByStatus: gapsByStatus(boards.gaps),
    refutationRate: refutationRate(boards.claims),
    extractorRecords,
    interceptedSubmits,
  }
}

async function ingestRound(input: {
  boards: Boards
  evidence: EvidenceRecord[]
  pages: PageSnapshot[]
  aae: AaeConfig
  config: RunConfig
  root: string
  runDir: string
  round: number
  log: (line: string) => void
  sessionId?: string
  usage: TokenUsage
  extractorRecords: ExtractorRecord[]
  wantExperiments: boolean
  onExperiments: (experiments: Experiment[]) => void
}): Promise<void> {
  const { json: digestJson } = buildDigest(input.evidence, input.pages)
  writeFileSync(join(input.runDir, 'digest.json'), digestJson + '\n')

  if (input.aae.miner.enabled) {
    const mined = mineTraffic(input.evidence, input.round)
    for (const claim of mined.claims) input.boards.addClaim(claim)
    for (const gap of mined.gaps) input.boards.addGap(gap)
    input.log(`miner: ${mined.claims.length} claims, ${mined.gaps.length} gaps`)
  }
  if (input.aae.sweeper.enabled) {
    const swept = sweepDomains(input.evidence, input.pages, input.round)
    for (const gap of swept.gaps) {
      if (gap.evidenceIds.length === 0) continue
      input.boards.addGap(gap)
    }
    input.log(`sweeper: ${swept.gaps.length} gaps`)
  }

  const seeded = seedCoverageGaps(input.evidence, input.round)
  for (const gap of seeded) {
    if (gap.evidenceIds.length === 0) continue
    input.boards.addGap(gap)
  }
  if (seeded.length > 0) input.log(`coverage seeds: ${seeded.length} gaps`)

  if (input.aae.extractors.enabled) {
    const extracted = await runExtractors({
      digestJson,
      config: input.config,
      root: input.root,
      round: input.round,
      concurrency: input.aae.extractors.concurrency,
      log: input.log,
      sessionId: input.sessionId,
      usage: input.usage,
    })
    for (const claim of extracted.claims) input.boards.addClaim(claim)
    input.extractorRecords.push(...extracted.records)
    input.log(`extractors: ${extracted.claims.length} claims`)
  }

  if (input.wantExperiments && input.aae.inquisitor.enabled) {
    const { experiments } = await runInquisitor({
      gaps: rankOpenGaps(input.boards.gaps, input.boards.claims),
      claims: input.boards.claims,
      digestJson,
      config: input.config,
      root: input.root,
      maxExperiments: input.aae.inquisitor.maxExperimentsPerRound,
      log: input.log,
      sessionId: input.sessionId,
      usage: input.usage,
    })
    for (const gap of input.boards.gaps) {
      if (experiments.some((e) => e.gapId === gap.id)) gap.status = 'planned'
    }
    input.onExperiments(experiments)
    input.log(`inquisitor: ${experiments.length} experiments`)
  }
}

export function loadRunEvidence(runDir: string): EvidenceRecord[] {
  const path = join(runDir, 'evidence', 'evidence.jsonl')
  try {
    return loadJsonl<EvidenceRecord>(path)
  } catch {
    return []
  }
}

export function loadPages(runDir: string): PageSnapshot[] {
  const path = join(runDir, 'pages.jsonl')
  try {
    return loadJsonl<PageSnapshot>(path)
  } catch {
    return []
  }
}

export function persistPages(runDir: string, pages: PageSnapshot[]): void {
  writeFileSync(join(runDir, 'pages.jsonl'), pages.map((p) => JSON.stringify(p)).join('\n') + (pages.length ? '\n' : ''))
}

export function copyPrompts(runDir: string): void {
  const dest = join(runDir, 'prompts')
  mkdirSync(dest, { recursive: true })
  const src = join(HERE, 'prompts')
  for (const name of readdirSync(src).sort()) {
    if (!name.endsWith('.md')) continue
    writeFileSync(join(dest, name), readFileSync(join(src, name)))
  }
}
