import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Run configuration and the shared task prompt (docs/04 §5.1, docs/07 §3).
 *
 * Both agents load their task statement through here. Rendering the one file in
 * one place is what makes the task prompt identical for baseline and AAE by
 * construction rather than by discipline (ADR-11) — the same reason both get the
 * same `Harness` object rather than two copies of a tool surface.
 *
 * Mechanics only (ADR-10): this reads, overlays and substitutes. It decides
 * nothing.
 */

export interface AaeConfig {
  rounds: { max: number; stopWhenNewClaimsBelow: number; stepBudgetSplit: number[] }
  miner: { enabled: boolean }
  sweeper: { enabled: boolean }
  inquisitor: { enabled: boolean; maxExperimentsPerRound: number }
  extractors: { enabled: boolean; concurrency: number }
  verifier: { enabled: boolean }
  reasoning: { enabled: boolean; budgetTokens: number; roles: string[] }
}

export interface RunConfig {
  target: { baseUrl: string }
  credentials: { email: string; password: string; role: string }
  budgets: {
    maxSteps: number
    wallClockMs: number
    /** Optional hard USD cap on one run's estimated LLM cost (agents/baseline/agent.ts checks it
     *  before every call, same stop-don't-continue semantics as maxSteps/wallClockMs). Undefined
     *  means no cap -- kept optional so it is not yet another required field for every caller
     *  that builds a minimal RunConfig (e.g. harness/selftest.ts). */
    maxCostUsd?: number
  }
  policy: { profile: 'strict' | 'sandbox'; allowlist: string[] }
  model: { id: string; temperature: number; maxTokens?: number }
  isolation: { deny: string[] }
  /**
   * AAE-internal architecture (ADR-11, ADR-21). Optional so the baseline and
   * harness/selftest keep working when they build a config without it. Subdivides
   * `budgets`; it must never raise them.
   */
  aae?: AaeConfig
}

const DEFAULT_PATH = 'config/run.default.json'
const LOCAL_PATH = 'config/run.local.json'
const PROMPT_PATH = 'config/task-prompt.md'

/**
 * `config/run.default.json`, overlaid by `config/run.local.json` if present,
 * then by environment variables. The local file is gitignored so a real target
 * never needs its credentials committed.
 */
export function loadRunConfig(root = process.cwd()): RunConfig {
  const base = readJson(join(root, DEFAULT_PATH))
  const local = existsSync(join(root, LOCAL_PATH)) ? readJson(join(root, LOCAL_PATH)) : {}
  const merged = deepMerge(base, local) as RunConfig

  const url = process.env.MINICRM_URL
  const email = process.env.AAE_EMAIL
  const password = process.env.AAE_PASSWORD
  if (url) merged.target.baseUrl = url
  if (email) merged.credentials.email = email
  if (password) merged.credentials.password = password

  assertComplete(merged)
  if (merged.aae) validateAaeConfig(merged.aae)
  return merged
}

/**
 * The task prompt both systems receive, verbatim.
 *
 * Throws if a placeholder is left unfilled: an agent silently told to sign in
 * with `{{email}}` would fail in a way that looks like an agent problem and is
 * not one.
 */
export function renderTaskPrompt(config: RunConfig, root = process.cwd()): string {
  const template = readFileSync(join(root, PROMPT_PATH), 'utf8')
  const body = template.replace(/^<!--[\s\S]*?-->\n*/, '')
  const values: Record<string, string> = {
    baseUrl: config.target.baseUrl,
    email: config.credentials.email,
    password: config.credentials.password,
    role: config.credentials.role,
    maxSteps: String(config.budgets.maxSteps),
  }

  const rendered = body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`task prompt uses unknown placeholder {{${key}}}`)
    // An empty substitution is worse than a missing one: the agent would be told
    // to sign in as "" and fail in a way that reads as an agent defect.
    if (value.trim() === '') throw new Error(`run configuration has no value for {{${key}}}`)
    return value
  })

  const leftover = rendered.match(/\{\{\w+\}\}/)
  if (leftover) throw new Error(`task prompt still contains ${leftover[0]} after rendering`)
  return rendered.trim()
}

/** What goes into the run ledger. Credentials are deliberately not included. */
export function ledgerEntry(config: RunConfig): Record<string, unknown> {
  return {
    baseUrl: config.target.baseUrl,
    role: config.credentials.role,
    maxSteps: config.budgets.maxSteps,
    wallClockMs: config.budgets.wallClockMs,
    maxCostUsd: config.budgets.maxCostUsd,
    policyProfile: config.policy.profile,
    model: config.model.id,
    temperature: config.model.temperature,
    maxTokens: config.model.maxTokens,
    isolationDeny: config.isolation.deny,
    ...(config.aae ? { aae: config.aae } : {}),
  }
}

/**
 * Fail at load, not at round three. `stepBudgetSplit` must have `rounds.max`
 * entries summing to ≤ 1.0; extractor concurrency must be ≥ 1.
 */
export function validateAaeConfig(aae: AaeConfig): void {
  if (!Number.isInteger(aae.rounds?.max) || aae.rounds.max < 1) {
    throw new Error('aae.rounds.max must be an integer ≥ 1')
  }
  const split = aae.rounds.stepBudgetSplit
  if (!Array.isArray(split) || split.length !== aae.rounds.max) {
    throw new Error(
      `aae.rounds.stepBudgetSplit must have aae.rounds.max (${aae.rounds.max}) entries, got ${split?.length ?? 0}`,
    )
  }
  for (const part of split) {
    if (typeof part !== 'number' || !Number.isFinite(part) || part < 0) {
      throw new Error('aae.rounds.stepBudgetSplit entries must be finite numbers ≥ 0')
    }
  }
  const sum = split.reduce((a, b) => a + b, 0)
  if (sum > 1.0 + Number.EPSILON) {
    throw new Error(`aae.rounds.stepBudgetSplit sums to ${sum}, which exceeds 1.0 (ADR-21: AAE may only subdivide the granted budget)`)
  }
  if (!Number.isInteger(aae.extractors?.concurrency) || aae.extractors.concurrency < 1) {
    throw new Error('aae.extractors.concurrency must be an integer ≥ 1')
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function deepMerge(base: unknown, overlay: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay ?? base
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    out[key] = key in base ? deepMerge(base[key], value) : value
  }
  return out
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertComplete(config: RunConfig): void {
  const missing: string[] = []
  if (!config.target?.baseUrl) missing.push('target.baseUrl')
  if (!config.credentials?.email) missing.push('credentials.email')
  if (!config.credentials?.password) missing.push('credentials.password')
  if (!config.budgets?.maxSteps) missing.push('budgets.maxSteps')
  if (!config.budgets?.wallClockMs) missing.push('budgets.wallClockMs')
  if (!config.policy?.profile) missing.push('policy.profile')
  if (!config.model?.id) missing.push('model.id')
  if (!config.isolation?.deny?.length) missing.push('isolation.deny')
  if (missing.length > 0) {
    throw new Error(`run configuration is missing: ${missing.join(', ')}`)
  }
}
