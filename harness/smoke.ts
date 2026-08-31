import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Harness } from './index.js'
import { loadDotEnv } from '../tooling/config/env.js'

/**
 * Live smoke test: drives the real MiniCRM through the harness the way an agent
 * would, and prints what was captured. It is not an agent — the steps are fixed
 * — it only proves that observation, actions, network capture, evidence and the
 * policy gate work end to end against the running target.
 *
 * Requires MiniCRM to be up (`npm run dev` inside miniCRM/, web on :5173).
 * Reset order still applies to real runs (ADR-4); this smoke test does not
 * mutate anything.
 *
 * Run: npm run harness:smoke
 */

loadDotEnv()

const BASE_URL = process.env.MINICRM_URL ?? 'http://localhost:5173'

function find(page: unknown, predicate: (label: string, role: string) => boolean): string | null {
  const elements = (page as { elements: Array<{ id: string; label: string; role: string }> }).elements
  return elements.find((element) => predicate(element.label ?? '', element.role))?.id ?? null
}

async function main(): Promise<void> {
  const runDir = mkdtempSync(join(tmpdir(), 'aae-smoke-'))
  const harness = new Harness({
    baseUrl: BASE_URL,
    runDir,
    policyProfile: 'sandbox',
    maxSteps: 40,
    headless: process.env.HEADED !== '1',
  })

  console.log(`target ${BASE_URL}`)
  console.log(`run artifacts ${runDir}\n`)

  await harness.start('/')

  let result = await harness.observe_page()
  if (!result.ok) throw new Error(`observe_page failed: ${result.error}`)
  let page = result.page as { path: string; elements: unknown[] }
  console.log(`observed ${page.path} with ${page.elements.length} elements`)

  // Credentials come from the run configuration and are given to the agent in the
  // task prompt (ADR-15); the form is also pre-filled, which is why the smoke test
  // can simply submit it.
  const submit = find(page, (label, role) => role === 'button' && /sign in|log ?in/i.test(label))
  if (!submit) throw new Error('no login button found — is MiniCRM serving the login page?')
  result = await harness.click(submit)
  console.log(`login click ok=${result.ok} ${JSON.stringify(result.events ?? result.error)}`)

  result = await harness.observe_page()
  page = result.page as { path: string; elements: unknown[] }
  console.log(`after login at ${page.path}`)

  const customers = find(page, (label) => /customers/i.test(label))
  if (customers) {
    result = await harness.click(customers)
    console.log(`customers click ok=${result.ok} ${JSON.stringify(result.events ?? result.error)}`)
    await harness.observe_page()
  }

  const events = (await harness.get_network_events()).events as Array<Record<string, unknown>>
  console.log(`\ncaptured ${events.length} api events:`)
  for (const event of events) {
    console.log(`  ${event.method} ${event.path} -> ${event.status}`)
  }

  const authHeaderSeen = events.some(
    (event) => (event.request_headers as Record<string, string> | undefined)?.['x-csrf-token'],
  )
  console.log(`\ncsrf header observed on at least one request: ${authHeaderSeen}`)
  console.log('credential redaction: request bodies below must not contain a plaintext password')
  const login = events.find((event) => String(event.path).endsWith('/auth/login'))
  console.log(`  ${JSON.stringify(login?.request_body ?? null)}`)

  await harness.stop()
  console.log(`\ntrajectory and evidence written to ${runDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
