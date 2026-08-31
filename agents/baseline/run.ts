import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Harness } from '../../harness/index.js'
import { loadDotEnv } from '../../tooling/config/env.js'
import { ledgerEntry, loadRunConfig } from '../../tooling/config/run.js'
import { estimateCostUsd } from '../../tooling/llm/client.js'
import { runBaseline } from './agent.js'

/**
 * Launch the baseline against the running target. Writes artifacts into the
 * runDir the harness receives (results/runs/baseline-<utc>/).
 *
 * Run: npm run baseline:run
 * Requires MiniCRM up and OPENROUTER_API_KEY (in .env, or already exported).
 */

async function main(): Promise<void> {
  const root = process.cwd()
  loadDotEnv(root)
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and fill it in, or export the key yourself, then re-run.',
    )
  }
  const config = loadRunConfig(root)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = join(root, 'results', 'runs', `baseline-${stamp}`)
  mkdirSync(runDir, { recursive: true })

  const harness = new Harness({
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
  console.log(`budget ${config.budgets.maxSteps} steps / ${config.budgets.wallClockMs} ms`)
  console.log(`run artifacts ${runDir}`)

  const wallStarted = Date.now()
  let usage = { input_tokens: 0, output_tokens: 0 }
  let validationRetriesUsed = 0

  try {
    await harness.start('/')
    const result = await runBaseline({ harness, config, root })
    usage = result.usage
    validationRetriesUsed = result.validationRetriesUsed
  } finally {
    await harness.stop()
  }

  const wall_time_ms = Date.now() - wallStarted
  const cost = estimateCostUsd(config.model.id, usage)
  const submission = harness.getSubmission()

  writeFileSync(join(runDir, 'reconstruction.json'), JSON.stringify(submission, null, 2) + '\n')
  writeFileSync(
    join(runDir, 'meta.json'),
    JSON.stringify(
      {
        ...ledgerEntry(config),
        system: 'baseline',
        wall_time_ms,
        cost,
        tool_actions: harness.stepsUsed(),
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        validation_retries_used: validationRetriesUsed,
        cost_note:
          'USD from tooling/llm/client.ts MODEL_PRICES_USD_PER_MTOK (OpenRouter list price for anthropic/claude-opus-4.6: $5 input / $25 output per 1M tokens).',
      },
      null,
      2,
    ) + '\n',
  )

  console.log(`wrote ${join(runDir, 'reconstruction.json')}`)
  console.log(`tool_actions=${harness.stepsUsed()} wall_time_ms=${wall_time_ms} cost_usd=${cost.toFixed(4)}`)
  console.log('score with:')
  console.log(
    `  node evaluator/bin/evaluate.mjs --submission ${join(runDir, 'reconstruction.json')} --all --meta ${join(runDir, 'meta.json')} --out ${runDir}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
