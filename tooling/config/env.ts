import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Loads `.env` from the repo root into process.env, if present (ADR-10:
 * mechanical only — reads and sets, decides nothing). A missing `.env` is not
 * an error: CI or a judge's shell may already export the variables directly.
 *
 * This is the one place secrets enter the process, so every entrypoint that
 * reads OPENROUTER_API_KEY / MINICRM_URL / AAE_EMAIL / AAE_PASSWORD from
 * process.env calls this first. Node's built-in loader (stable since
 * v20.12/v21.7) is used instead of a dotenv dependency — one fewer package to
 * audit, and this repo already requires Node >=22.
 */
export function loadDotEnv(root = process.cwd()): void {
  const path = join(root, '.env')
  if (existsSync(path)) {
    process.loadEnvFile(path)
  }
}
