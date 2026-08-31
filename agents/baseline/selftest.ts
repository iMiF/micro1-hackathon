import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRunConfig, renderTaskPrompt } from '../../tooling/config/run.js'
import {
  assembleAgentContext,
  assembledSystem,
  assertIsolated,
  loadPublicSchema,
  loadPublicVocabulary,
} from '../../tooling/isolation/context.js'
import {
  recoverSubmission,
  repairTruncatedJson,
  salvageSubmission,
} from '../../tooling/reconstruction/recover.js'
import {
  costFromTokenPrices,
  lookupOpenRouterPrices,
  nonstreamingTimeoutMs,
  pricesFromOpenRouterModel,
  supportsPromptCaching,
} from '../../tooling/llm/client.js'
import { VALIDATION_RETRIES } from '../../tooling/reconstruction/validate.js'
import { loadSystemPrompt, taskPromptFor } from './agent.js'

/**
 * Checks the baseline's isolation, prompt wiring, and shared constants without
 * a running target or an LLM. Live behaviour is `npm run baseline:run`.
 *
 * Run: npm run baseline:selftest
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

let failures = 0
function test(name: string, body: () => void): void {
  try {
    body()
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ${error instanceof Error ? error.message : String(error)}`)
  }
}

function cleanContext() {
  return assembleAgentContext({
    systemPrompt: loadSystemPrompt(),
    taskPrompt: renderTaskPrompt(loadRunConfig(ROOT), ROOT),
    publicSchema: loadPublicSchema(ROOT),
    publicVocabulary: loadPublicVocabulary(ROOT),
  })
}

console.log('isolation')

test('a clean assembled context is allowed through', () => {
  assertIsolated(cleanContext(), loadRunConfig(ROOT).isolation.deny, ROOT)
})

test('a planted ground-truth id fails the check', () => {
  const ctx = cleanContext()
  ctx.conversation = [{ role: 'assistant', content: 'see sem-session-cookie' }]
  assert.throws(() => assertIsolated(ctx, loadRunConfig(ROOT).isolation.deny, ROOT), /sem-session-cookie/)
})

test('a planted ground-truth path fails the check', () => {
  const ctx = cleanContext()
  ctx.conversation = [{ role: 'user', content: 'read miniCRM/benchmark/ground-truth/semantics.json' }]
  assert.throws(
    () => assertIsolated(ctx, loadRunConfig(ROOT).isolation.deny, ROOT),
    /ground-truth/,
  )
})

test('cases.json, target source, and docs/ in conversation fail', () => {
  const deny = loadRunConfig(ROOT).isolation.deny
  const planted = [
    'miniCRM/benchmark/cases.json',
    'miniCRM/apps/api/src/session.ts',
    'docs/02-architecture.md',
  ]
  for (const marker of planted) {
    const ctx = cleanContext()
    ctx.conversation = [{ role: 'user', content: marker }]
    assert.throws(() => assertIsolated(ctx, deny, ROOT), /isolation/)
  }
})

test('public vocabulary may mention docs/04; that is not a leak', () => {
  const vocab = loadPublicVocabulary(ROOT)
  assert.ok(vocab.includes('docs/04'), 'fixture: vocabulary still cites docs/04')
  assertIsolated(cleanContext(), loadRunConfig(ROOT).isolation.deny, ROOT)
})

console.log('prompt contract (ADR-11)')

test('the task prompt is rendered, not authored or wrapped here', () => {
  const config = loadRunConfig(ROOT)
  const expected = renderTaskPrompt(config, ROOT)
  assert.equal(taskPromptFor(config, ROOT), expected)
  const ctx = cleanContext()
  assert.equal(ctx.taskPrompt, expected)
  assert.ok(!expected.includes('<!--'))
  assert.ok(!/\{\{\w+\}\}/.test(expected))
  assert.ok(!ctx.systemPrompt.includes(expected), 'task prompt must not be copied into the system prompt')
})

test('the system prompt is the honest-minimal file in this directory', () => {
  const prompt = loadSystemPrompt()
  assert.ok(prompt.includes('observe_page'))
  assert.ok(prompt.includes('submit_reconstruction'))
  assert.ok(prompt.includes('Do not invent'))
  assert.ok(prompt.includes('Explore thoroughly'))
  assert.ok(prompt.includes('You have no planner'))
})

test('assembled system includes the public schema and vocabulary', () => {
  const system = assembledSystem(cleanContext())
  assert.ok(system.includes('"schema_version"'))
  assert.ok(system.includes('path_placeholders'))
})

console.log('shared mechanics')

test('validation retries are a shared constant, not an adaptive policy', () => {
  assert.equal(VALIDATION_RETRIES, 2)
})

test('the request timeout is derived from the shared output ceiling, not guessed', () => {
  // The SDK throws below this: 60 min at 128k output tokens, refused past 10 min.
  assert.equal(nonstreamingTimeoutMs(32_000), 900_000)
  assert.equal(nonstreamingTimeoutMs(16_384), 600_000, 'small ceilings keep the ten-minute floor')
  assert.ok(nonstreamingTimeoutMs(loadRunConfig(ROOT).model.maxTokens ?? 0) >= 600_000)
})

test('run cost is list price from the OpenRouter catalog, not a hardcoded table', () => {
  const entry = { id: 'deepseek/deepseek-v4-pro', pricing: { prompt: '0.00000105', completion: '0.0000042' } }
  assert.deepEqual(pricesFromOpenRouterModel(entry), {
    prompt: 0.00000105,
    completion: 0.0000042,
    cacheRead: undefined,
    cacheWrite: undefined,
  })
  assert.equal(costFromTokenPrices({ prompt: 1, completion: 2 }, { input_tokens: 3, output_tokens: 4 }), 11)
  const catalog = new Map<string, unknown>([[entry.id, entry]])
  assert.deepEqual(lookupOpenRouterPrices(catalog, entry.id), pricesFromOpenRouterModel(entry))
  assert.throws(() => lookupOpenRouterPrices(catalog, 'missing/model'), /no prices for missing\/model/)
})

test('cache tokens are priced from the catalog when published, else Anthropic\'s multipliers', () => {
  const withCachePricing = {
    id: 'anthropic/claude-sonnet-5',
    pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003', input_cache_write: '0.00000375' },
  }
  const pricesFromCatalog = pricesFromOpenRouterModel(withCachePricing)
  assert.deepEqual(pricesFromCatalog, {
    prompt: 0.000003,
    completion: 0.000015,
    cacheRead: 0.0000003,
    cacheWrite: 0.00000375,
  })
  const usage = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 }
  // Catalog rates: 100*0.000003 + 10*0.000015 + 1000*0.0000003 + 200*0.00000375 = 0.0015
  assert.ok(Math.abs(costFromTokenPrices(pricesFromCatalog, usage) - 0.0015) < 1e-12)

  // No published cache rates: falls back to 0.1x prompt (read) / 1.25x prompt (write), never throws.
  const noCachePricing = pricesFromOpenRouterModel({ id: 'x', pricing: { prompt: '0.000003', completion: '0.000015' } })
  const fallbackCost = costFromTokenPrices(noCachePricing, usage)
  const expectedFallback = 100 * 0.000003 + 10 * 0.000015 + 1000 * 0.0000003 + 200 * 0.00000375
  assert.ok(Math.abs(fallbackCost - expectedFallback) < 1e-12, 'fallback multipliers match Anthropic\'s published 0.1x/1.25x')
})

test('prompt caching is offered only to Anthropic models (ADR-10: mechanics, not strategy)', () => {
  assert.equal(supportsPromptCaching('anthropic/claude-opus-4.6'), true)
  assert.equal(supportsPromptCaching('anthropic/claude-sonnet-5'), true)
  assert.equal(supportsPromptCaching('deepseek/deepseek-v4-pro'), false)
  assert.equal(supportsPromptCaching('deepseek/deepseek-chat-v3.1'), false)
})

test('submit unwraps a reconstruction that was not nested under reconstruction', () => {
  const flat = { schema_version: '1.0.0', operations: [], semantic_facts: [], dependencies: [], workflows: [], claims: [] }
  assert.deepEqual(recoverSubmission(flat), flat)
  assert.deepEqual(recoverSubmission({ reconstruction: flat }), flat)
  assert.equal(recoverSubmission({}), undefined)
})

test('submit recovers a reconstruction written as a text block in the same turn', () => {
  const doc = { schema_version: '1.0.0', operations: [{ method: 'GET', path: '/api/x' }] }
  const recovered = recoverSubmission({}, `here is the document\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\``)
  assert.deepEqual(recovered, doc)
})

console.log('salvage (ADR-17)')

test('a document cut off mid-generation keeps the operations that did arrive', () => {
  const full = {
    schema_version: '1.0.0',
    operations: [
      { method: 'GET', path: '/api/orders', evidence: [{ kind: 'network_request' }] },
      { method: 'GET', path: '/api/customers', evidence: [{ kind: 'network_request' }] },
    ],
  }
  const truncated = JSON.stringify(full).slice(0, JSON.stringify(full).length - 40)
  const repaired = repairTruncatedJson(truncated) as { operations: unknown[] }
  assert.ok(Array.isArray(repaired.operations))
  assert.equal(repaired.operations.length, 1)
  assert.deepEqual(repaired.operations[0], full.operations[0])
})

test('salvage fills only the required sections the truncation removed, never facts', () => {
  const partial = '{"schema_version":"1.0.0","operations":[{"method":"GET","path":"/api/orders"}'
  const salvaged = salvageSubmission({}, partial) as Record<string, unknown>
  assert.deepEqual(salvaged.operations, [{ method: 'GET', path: '/api/orders' }])
  for (const section of ['semantic_facts', 'dependencies', 'workflows', 'claims']) {
    assert.deepEqual(salvaged[section], [], `${section} is filled empty, not invented`)
  }
})

test('salvage returns undefined when there is nothing to recover', () => {
  assert.equal(salvageSubmission({}, 'I could not complete the reconstruction.'), undefined)
  assert.equal(salvageSubmission(undefined, ''), undefined)
})

console.log('tree boundary (ADR-10)')

test('this directory does not import agents/aae', () => {
  for (const name of readdirSync(HERE)) {
    if (!name.endsWith('.ts')) continue
    const text = readFileSync(join(HERE, name), 'utf8')
    assert.ok(
      !/from\s+['"][^'"]*agents\/aae/.test(text) && !/import\s*\(\s*['"][^'"]*agents\/aae/.test(text),
      `${name} imports agents/aae`,
    )
  }
})

console.log(failures === 0 ? '\nall baseline self-tests passed' : `\n${failures} failing`)
process.exit(failures === 0 ? 0 : 1)
