import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePath, operationKey } from '../tooling/browser/paths.js'
import { classify, decide } from './policy.js'
import { SubmissionValidator } from '../tooling/reconstruction/validate.js'
import type { ObservedElement } from '../tooling/browser/observe.js'

/**
 * Checks the parts of the harness that do not need a running target, so a
 * broken normalizer or a broken policy gate is caught before a run rather than
 * inside one. The live smoke test against MiniCRM is a separate step.
 *
 * Run: npm run harness:selftest
 */

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

function element(overrides: Partial<ObservedElement>): ObservedElement {
  return {
    id: 'el-0001',
    role: 'button',
    label: '',
    tag: 'button',
    testId: null,
    name: null,
    type: null,
    value: null,
    href: null,
    options: null,
    enabled: true,
    ...overrides,
  }
}

console.log('path normalization')

test('concrete ids are erased', () => {
  assert.equal(normalizePath('/api/customers/12'), '/api/customers/{}')
  assert.equal(normalizePath('/api/orders/7/activity'), '/api/orders/{}/activity')
})

test('parameter NAMES are erased, so {id} and {customerId} agree', () => {
  assert.equal(
    normalizePath('/api/customers/{customerId}/addresses'),
    normalizePath('/api/customers/{id}/addresses'),
  )
  assert.equal(
    normalizePath('/api/customers/12/addresses'),
    normalizePath('/api/customers/{customerId}/addresses'),
  )
})

test('query string and trailing slash do not change the key', () => {
  assert.equal(operationKey('get', '/api/customers?q=ann&page=2'), 'GET /api/customers')
  assert.equal(normalizePath('/api/products/'), '/api/products')
})

test('route words that look like ids are not erased', () => {
  assert.equal(normalizePath('/api/customers/suggest'), '/api/customers/suggest')
  assert.equal(normalizePath('/api/dashboard/summary'), '/api/dashboard/summary')
})

console.log('risk policy')

test('navigation and typing are read-only', () => {
  assert.equal(classify({ element: element({ role: 'link', label: 'Customers' }), action: 'click' }), 'READ_ONLY')
  assert.equal(classify({ element: element({ role: 'textbox', label: 'Search' }), action: 'fill' }), 'READ_ONLY')
})

test('deletion is destructive and blocked without an allowlist', () => {
  const input = { element: element({ label: 'Delete customer' }), action: 'click' as const }
  assert.equal(classify(input), 'DESTRUCTIVE')
  assert.equal(decide(input, 'sandbox').verdict, 'block')
  assert.equal(decide(input, 'strict').verdict, 'block')
})

test('an allowlisted destructive action still needs approval, never silent allow', () => {
  const input = {
    element: element({ label: 'Delete draft order' }),
    action: 'click' as const,
    allowlist: ['delete draft order'],
  }
  assert.equal(decide(input, 'sandbox').verdict, 'needs_approval')
})

test('external side effects are blocked in both profiles', () => {
  const input = { element: element({ label: 'Send invoice by email' }), action: 'click' as const }
  assert.equal(classify(input), 'EXTERNAL_SIDE_EFFECT')
  assert.equal(decide(input, 'sandbox').verdict, 'block')
  assert.equal(decide(input, 'strict').verdict, 'block')
})

test('UNKNOWN is the only class the profile changes', () => {
  const input = { element: element({ label: 'x', role: 'other' as const }), action: 'click' as const }
  assert.equal(classify(input), 'UNKNOWN')
  assert.equal(decide(input, 'strict').verdict, 'block')
  assert.equal(decide(input, 'sandbox').verdict, 'allow')
})

console.log('submission validation (ADR-12: mechanical only)')

const schemaPath = join(
  process.cwd(),
  'miniCRM/benchmark/schemas/reconstruction-output.schema.json',
)
const validator = new SubmissionValidator(schemaPath)

test('the reference reconstruction validates', () => {
  const perfect = JSON.parse(
    readFileSync(join(process.cwd(), 'miniCRM/benchmark/examples/perfect-reconstruction.json'), 'utf8'),
  ) as unknown
  const result = validator.check(perfect)
  assert.equal(result.valid, true, result.errors.join('; '))
})

test('an invalid submission fails with a readable reason', () => {
  const result = validator.check({ schema_version: '1.0.0' })
  assert.equal(result.valid, false)
  assert.ok(result.errors.length > 0)
})

test('duplicate facts collapse, ids are assigned, meaning is untouched', () => {
  const fact = { kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: '  session cookie  ' }
  const result = validator.check({
    schema_version: '1.0.0',
    operations: [],
    semantic_facts: [structuredClone(fact), structuredClone(fact)],
    dependencies: [],
    workflows: [],
    claims: [],
  })
  const facts = (result.normalized as { semantic_facts: Array<Record<string, unknown>> }).semantic_facts
  assert.equal(facts.length, 1)
  assert.equal(facts[0]?.id, 'fact-1')
  assert.equal(facts[0]?.meaning, 'session cookie')
  assert.equal(facts[0]?.value, 'sid')
})

console.log(failures === 0 ? '\nall harness self-tests passed' : `\n${failures} failing`)
process.exit(failures === 0 ? 0 : 1)
