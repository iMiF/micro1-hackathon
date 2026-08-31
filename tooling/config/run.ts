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

export interface RunConfig {
  target: { baseUrl: string }
  credentials: { email: string; password: string; role: string }
  budgets: { maxSteps: number; wallClockMs: number }
  policy: { profile: 'strict' | 'sandbox'; allowlist: string[] }
  model: { id: string; temperature: number; maxTokens?: number }
  isolation: { deny: string[] }
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
    policyProfile: config.policy.profile,
    model: config.model.id,
    temperature: config.model.temperature,
    maxTokens: config.model.maxTokens,
    isolationDeny: config.isolation.deny,
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
