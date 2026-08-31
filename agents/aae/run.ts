import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Harness } from '../../harness/index.js'
import { loadDotEnv } from '../../tooling/config/env.js'
import { ledgerEntry, loadRunConfig } from '../../tooling/config/run.js'
import { estimateCostUsd, type TokenUsage } from '../../tooling/llm/client.js'
import { runAae } from './agent.js'

/**
 * Launch AAE against the running target, or extract from a recorded evidence
 * directory when AAE_FROM_EVIDENCE is set.
 *
 * Run: npm run aae:run
 * Requires OPENROUTER_API_KEY. Live runs also need MiniCRM up.
 */

async function main(): Promise<void> {
  const root = process.cwd()
  loadDotEnv(root)
  const reassembleOnly = Boolean(process.env.AAE_REASSEMBLE_CLAIMS)
  if (!process.env.OPENROUTER_API_KEY && !reassembleOnly) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and fill it in, or export the key yourself, then re-run.',
    )
  }
  const config = loadRunConfig(root)
  if (!config.aae) {
    throw new Error('config/run.default.json is missing the aae block')
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(root, 'results', 'runs', `aae-${stamp}`)
  mkdirSync(runDir, { recursive: true })
  const sessionId = `aae-${stamp}`
  const evidenceDir = process.env.AAE_FROM_EVIDENCE
  const offline = Boolean(evidenceDir) || reassembleOnly

  const harness = offline
    ? null
    : new Harness({
        baseUrl: config.target.baseUrl,
        runDir,
        policyProfile: config.policy.profile,
        maxSteps: config.budgets.maxSteps,
        wallClockMs: config.budgets.wallClockMs,
        allowlist: config.policy.allowlist,
        headless: process.env.HEADED !== '1',
      })

  console.log(`target ${config.target.baseUrl}`)
  console.log(`model ${config.model.id} temperature ${config.model.temperature}`)
  console.log(
    `budget ${config.budgets.maxSteps} steps / ${config.budgets.wallClockMs} ms` +
      (config.budgets.maxCostUsd != null ? ` / $${config.budgets.maxCostUsd}` : ''),
  )
  if (evidenceDir) console.log(`offline evidence ${evidenceDir}`)
  if (process.env.AAE_REASSEMBLE_CLAIMS) console.log(`reassemble claims ${process.env.AAE_REASSEMBLE_CLAIMS}`)
  console.log(`run artifacts ${runDir}`)

  const wallStarted = Date.now()
  let usage: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  let ablated: string[] = []
  let roundsRun = 0
  let stepsPerRound: number[] = []
  let claimsBySupport = { observed: 0, varied: 0, refuted_attempt: 0 }
  let gapsByStatus = { open: 0, planned: 0, attempted: 0, resolved: 0, unreachable: 0 }
  let refutation = 0

  try {
    if (harness) await harness.start('/')
    const result = await runAae({
      harness,
      config,
      runDir,
      root,
      sessionId,
      evidenceDir,
    })
    usage = result.usage
    ablated = result.ablated
    roundsRun = result.roundsRun
    stepsPerRound = result.stepsPerRound
    claimsBySupport = result.claimsBySupport
    gapsByStatus = result.gapsByStatus
    refutation = result.refutationRate
  } finally {
    if (harness) await harness.stop()
  }

  const wall_time_ms = Date.now() - wallStarted
  const cost = await estimateCostUsd(config.model.id, usage)
  const submission = harness ? harness.getSubmission() : undefined
  if (submission && typeof submission === 'object') {
    writeFileSync(join(runDir, 'reconstruction.json'), JSON.stringify(submission, null, 2) + '\n')
  }

  writeFileSync(
    join(runDir, 'meta.json'),
    JSON.stringify(
      {
        ...ledgerEntry(config),
        system: 'aae',
        aae: config.aae,
        ablated,
        rounds_run: roundsRun,
        steps_per_round: stepsPerRound,
        claims_by_support: claimsBySupport,
        gaps_by_status: gapsByStatus,
        refutation_rate: refutation,
        wall_time_ms,
        cost,
        tool_actions: harness ? harness.stepsUsed() : 0,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cost_note:
          'USD estimated from OpenRouter GET /api/v1/models list prices (prompt + completion per token, plus cache read/write rates when the catalog publishes them) applied to native token counts from the run.',
      },
      null,
      2,
    ) + '\n',
  )

  console.log(`wrote ${join(runDir, 'reconstruction.json')}`)
  console.log(
    `tool_actions=${harness ? harness.stepsUsed() : 0} wall_time_ms=${wall_time_ms} cost_usd=${cost.toFixed(4)} ` +
      `cache_read=${usage.cache_read_input_tokens} cache_write=${usage.cache_creation_input_tokens} ` +
      `rounds=${roundsRun} ablated=${ablated.join(',') || 'none'}`,
  )
  console.log('score with:')
  console.log(
    `  node evaluator/bin/evaluate.mjs --submission ${join(runDir, 'reconstruction.json')} --all --meta ${join(runDir, 'meta.json')} --out ${runDir}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
