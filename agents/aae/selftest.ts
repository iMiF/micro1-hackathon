import assert from 'node:assert/strict'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EvidenceRecord } from '../../tooling/evidence/store.js'
import { validateAaeConfig, type AaeConfig } from '../../tooling/config/run.js'
import { SubmissionValidator } from '../../tooling/reconstruction/validate.js'
import {
  canonicalKey,
  normalizeFieldRef,
  normalizeSubject,
  operationKey,
  semanticFactKey,
} from './canonical.js'
import { Boards, resolveClaims, type ClaimEntry } from './boards.js'
import { buildDigest, type PageSnapshot } from './digest.js'
import { mineTraffic } from './miner.js'
import { seedCoverageGaps, sweepDomains } from './sweeper.js'
import { assembleFromClaims, assembleFromSectionItems } from './assemble.js'
import { INTERCEPT_MESSAGE, dispatchExploreTool } from './explore.js'
import { rankOpenGaps } from './inquisitor.js'
import { applyAblations, computeRoundAllotments } from './agent.js'
import { normalizePath } from '../../tooling/browser/paths.js'

/**
 * Offline AAE checks: no browser, no API key, no network.
 * Live behaviour is `npm run aae:run`.
 *
 * Run: npm run aae:selftest
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

let failures = 0

function check(name: string, body: () => void): void {
  try {
    body()
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function checkAsync(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body()
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('canonical (docs/04 §4)')

check('placeholder names are erased; concrete ids too', () => {
  assert.equal(normalizePath('/api/customers/{id}/addresses'), '/api/customers/{}/addresses')
  assert.equal(normalizePath('/api/customers/{customerId}/addresses'), '/api/customers/{}/addresses')
  assert.equal(normalizePath('/api/customers/12/addresses'), '/api/customers/{}/addresses')
  assert.equal(
    operationKey({ method: 'get', path: '/api/customers/{id}/addresses' }),
    operationKey({ method: 'GET', path: '/api/customers/12/addresses' }),
  )
})

check('different routes do not collide after erasure', () => {
  const a = operationKey({ method: 'PATCH', path: '/api/orders/{id}/status' })
  const b = operationKey({ method: 'PATCH', path: '/api/orders/{id}' })
  assert.notEqual(a, b)
  assert.equal(a, 'PATCH /api/orders/{}/status')
  assert.equal(b, 'PATCH /api/orders/{}')
})

check('field-reference prefixes are case-sensitive (except header names)', () => {
  assert.notEqual(normalizeFieldRef('cookie:SID'), normalizeFieldRef('cookie:sid'))
  assert.equal(normalizeFieldRef('header:X-CSRF-Token'), normalizeFieldRef('header:x-csrf-token'))
  assert.equal(normalizeFieldRef('query.Country'), 'query.Country')
  assert.notEqual(normalizeFieldRef('query.Country'), normalizeFieldRef('query.country'))
})

check('JSONPath array indexes wildcard; $[] prefix collapses', () => {
  assert.equal(normalizeFieldRef('$.items[0].productId'), normalizeFieldRef('$.items[*].productId'))
  assert.equal(normalizeFieldRef('$.items[].productId'), '$.items[].productId')
  assert.equal(normalizeFieldRef('$[].id'), normalizeFieldRef('$.id'))
})

check('query-parameter subjects canonicalize to METHOD /path?param', () => {
  assert.equal(normalizeSubject('GET /api/customers q'), 'GET /api/customers?q')
  assert.equal(normalizeSubject('GET /api/customers query.archived'), 'GET /api/customers?archived')
  assert.equal(normalizeSubject('GET /api/customers?archived'), 'GET /api/customers?archived')
  assert.equal(normalizeSubject('GET /api/customers/suggest'), 'GET /api/customers/suggest')
})

check('accepts "true"/"false" coerce to booleans in the fact key', () => {
  const a = semanticFactKey({
    kind: 'query_semantics',
    subject: 'GET /api/x?flag',
    value: { accepts: ['true', 'false'] },
  })
  const b = semanticFactKey({
    kind: 'query_semantics',
    subject: 'GET /api/x?flag',
    value: { accepts: [true, false] },
  })
  assert.equal(a, b)
})

check('workflow key drops refresh and maps auth → required_business', () => {
  const withRefresh = canonicalKey('workflows', {
    steps: [
      { operation: 'POST /api/auth/login', role: 'auth' },
      { operation: 'POST /api/orders', role: 'required_business' },
      { operation: 'GET /api/orders/{}', role: 'refresh' },
    ],
  })
  const without = canonicalKey('workflows', {
    steps: [
      { operation: 'POST /api/auth/login', role: 'required_business' },
      { operation: 'POST /api/orders', role: 'required_business' },
    ],
  })
  assert.equal(withRefresh, without)
})

console.log('board merge')

function fact(
  partial: Partial<ClaimEntry> & { value: unknown; subject: string; evidenceIds: string[]; kind?: string },
): ClaimEntry {
  const item = {
    kind: partial.kind ?? 'enum_mapping',
    subject: partial.subject,
    value: partial.value,
    meaning: 'm',
    evidence: [{ kind: 'ui_label', ui_text: 'm' }],
  }
  return {
    section: 'semantic_facts',
    canonicalKey: semanticFactKey(item) ?? '',
    item,
    evidenceIds: partial.evidenceIds,
    producedBy: partial.producedBy ?? 'extract:enums',
    support: partial.support ?? 'observed',
    round: partial.round ?? 1,
  }
}

check('identical key merges, unions evidence, keeps highest support', () => {
  const a = fact({ subject: 'order.statusId', value: 40, evidenceIds: ['ev_001'], support: 'observed' })
  const b = fact({ subject: 'order.statusId', value: 40, evidenceIds: ['ev_002'], support: 'varied' })
  const { winners, conflicts } = resolveClaims([a, b], 0)
  assert.equal(conflicts.length, 0)
  assert.equal(winners.length, 1)
  assert.equal(winners[0]?.support, 'varied')
  assert.deepEqual(winners[0]?.evidenceIds, ['ev_001', 'ev_002'])
})

check('enum_mapping keeps every distinct value on the same subject', () => {
  const a = fact({ subject: 'order.statusId', value: 10, evidenceIds: ['ev_001'] })
  const b = fact({ subject: 'order.statusId', value: 20, evidenceIds: ['ev_002'] })
  const { winners, conflicts } = resolveClaims([a, b], 0)
  assert.equal(conflicts.length, 0)
  assert.equal(winners.length, 2)
  const values = winners.map((w) => w.item.value).sort()
  assert.deepEqual(values, [10, 20])
})

check('mutually exclusive kind, different value: more observations win', () => {
  const a = fact({ kind: 'auth', subject: 'cookie:sid', value: 'sid', evidenceIds: ['ev_001'] })
  const b = fact({ kind: 'auth', subject: 'cookie:sid', value: { csrf: false }, evidenceIds: ['ev_002', 'ev_003'] })
  const { winners, conflicts } = resolveClaims([a, b], 0)
  assert.equal(conflicts.length, 0)
  assert.equal(winners.length, 1)
  assert.deepEqual(winners[0]?.item.value, { csrf: false })
})

check('mutually exclusive kind, tie produces a gap, not a winner', () => {
  const a = fact({ kind: 'auth', subject: 'cookie:sid', value: 'sid', evidenceIds: ['ev_001'] })
  const b = fact({ kind: 'auth', subject: 'cookie:sid', value: { csrf: false }, evidenceIds: ['ev_002'] })
  const { winners, conflicts } = resolveClaims([a, b], 0)
  assert.equal(winners.length, 0)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0]?.origin, 'claim')
  assert.match(conflicts[0]?.question ?? '', /conflicting/)
})

check('accepts numeric strings coerce so "1" and 1 are one key', () => {
  const a = semanticFactKey({
    kind: 'query_semantics',
    subject: 'GET /api/x?page',
    value: { accepts: ['1'] },
  })
  const b = semanticFactKey({
    kind: 'query_semantics',
    subject: 'GET /api/x?page',
    value: { accepts: [1] },
  })
  assert.equal(a, b)
})

console.log('miner and sweeper')

function net(id: string, step: number, data: Record<string, unknown>): EvidenceRecord {
  return {
    id,
    kind: 'network_event',
    step,
    at: '2026-08-31T00:00:00.000Z',
    data: {
      method: 'GET',
      path: '/api/items',
      rawPath: '/api/items',
      query: { page: '1', pageSize: '5' },
      status: 200,
      duration_ms: 4,
      request_body: null,
      response_body: {
        items: [1, 2, 3, 4, 5],
        createdAt: '2026-08-31T00:00:00.000Z',
      },
      response_headers: { 'content-type': 'application/json' },
      ...data,
    },
  }
}

check('TrafficMiner records always-sent query params as gaps, not accepts claims', () => {
  const evidence = [
    net('ev_010', 4, {}),
    net('ev_011', 5, {}),
    net('ev_012', 6, {}),
  ]
  const { claims, gaps } = mineTraffic(evidence, 1)
  assert.equal(claims.length, 0)
  assert.ok(gaps.length > 0)
  const questions = gaps.map((g) => g.question).join('\n')
  assert.match(questions, /pageSize/)
  assert.match(questions, /client default/)
  for (const gap of gaps) {
    assert.ok(gap.evidenceIds.length > 0)
  }
})

check('DomainSweeper is a set difference and never emits a claim', () => {
  const evidence: EvidenceRecord[] = [
    {
      id: 'ev_020',
      kind: 'ui_action',
      step: 8,
      at: '2026-08-31T00:00:00.000Z',
      data: { tool: 'select', page: '/orders', element: { label: 'Status', role: 'select' }, value: '10' },
    },
    net('ev_021', 8, { path: '/api/orders', rawPath: '/api/orders', query: { statusId: '10' }, response_body: { items: [{ statusId: 10 }] } }),
  ]
  const pages: PageSnapshot[] = [
    {
      step: 8,
      path: '/orders',
      text: 'Orders',
      controls: [
        {
          label: 'Status',
          role: 'select',
          options: ['10|Draft', '20|Confirmed', '40|Shipped'],
          enabled: true,
        },
      ],
    },
  ]
  const { claims, gaps } = sweepDomains(evidence, pages, 1)
  assert.equal(claims.length, 0)
  const questions = gaps.map((g) => g.question).join('\n')
  assert.match(questions, /40/)
  assert.doesNotMatch(questions, /select "Status" = 10/)
  for (const gap of gaps) assert.ok(gap.evidenceIds.length > 0)
})

check('DomainSweeper does not treat an unrelated body value as covering a select option', () => {
  const evidence: EvidenceRecord[] = [
    net('ev_022', 9, {
      path: '/api/countries',
      rawPath: '/api/countries',
      query: {},
      response_body: [{ code: 'US', name: 'United States' }],
    }),
  ]
  const pages: PageSnapshot[] = [
    {
      step: 9,
      path: '/customers/1',
      text: 'Customer',
      controls: [
        {
          label: 'Country',
          role: 'select',
          options: ['CA|Canada', 'US|United States'],
          enabled: true,
        },
      ],
    },
  ]
  const { gaps } = sweepDomains(evidence, pages, 1)
  const questions = gaps.map((g) => g.question).join('\n')
  assert.match(questions, /US/)
  assert.match(questions, /CA/)
})

check('coverage seeds emit DELETE/cancel gaps when those ops were never seen', () => {
  const evidence: EvidenceRecord[] = [
    net('ev_040', 1, { method: 'GET', path: '/api/orders', rawPath: '/api/orders', query: {}, response_body: { items: [] } }),
    net('ev_041', 2, { method: 'GET', path: '/api/customers', rawPath: '/api/customers', query: {}, response_body: { items: [] } }),
    net('ev_042', 3, {
      method: 'PATCH',
      path: '/api/orders/{}/status',
      rawPath: '/api/orders/1/status',
      query: {},
      request_body: { statusId: 20 },
      response_body: { statusId: 20 },
    }),
  ]
  const gaps = seedCoverageGaps(evidence, 1)
  const questions = gaps.map((g) => g.question).join('\n')
  assert.match(questions, /DELETE \/api\/orders/)
  assert.match(questions, /DELETE \/api\/customers/)
  assert.match(questions, /50/)
})

check('inquisitor ranks destructive sweeper gaps above pagination defaults', () => {
  const gaps = [
    { id: 'gap_001', origin: 'miner' as const, question: 'pageSize is present on every GET /api/orders', evidenceIds: ['ev_1'], status: 'open' as const, round: 1 },
    { id: 'gap_002', origin: 'sweeper' as const, question: 'On an order detail page, use Delete on a draft order', evidenceIds: ['ev_1'], status: 'open' as const, round: 1 },
  ]
  const ranked = rankOpenGaps(gaps, [])
  assert.equal(ranked[0]?.id, 'gap_002')
})

function policyBlock(id: string, step: number, label: string): EvidenceRecord {
  return {
    id,
    kind: 'policy_decision',
    step,
    at: '2026-08-31T00:00:00.000Z',
    data: {
      tool: 'click',
      element: { id: 'el_1', label, role: 'button' },
      riskClass: 'DESTRUCTIVE',
      verdict: 'block',
      reason: 'destructive',
    },
  }
}

check('TrafficMiner emits DELETE from blocked Delete draft and ignores Delete Me', () => {
  const draft = mineTraffic([policyBlock('ev_050', 10, 'Delete draft')], 1)
  const ops = draft.claims.filter((c) => c.section === 'operations')
  const wfs = draft.claims.filter((c) => c.section === 'workflows')
  assert.equal(ops.length, 1)
  assert.equal(ops[0]?.canonicalKey, 'DELETE /api/orders/{}')
  assert.equal(wfs.length, 1)
  const named = mineTraffic([policyBlock('ev_051', 11, 'Delete Me')], 1)
  assert.equal(named.claims.length, 0)
})

check('TrafficMiner maps exact Delete to the nearby detail resource', () => {
  const evidence: EvidenceRecord[] = [
    net('ev_052', 8, { method: 'GET', path: '/api/customers/{}', rawPath: '/api/customers/12', query: {}, response_body: { id: 12 } }),
    policyBlock('ev_053', 9, 'Delete'),
  ]
  const { claims } = mineTraffic(evidence, 1)
  const ops = claims.filter((c) => c.section === 'operations')
  assert.equal(ops.length, 1)
  assert.equal(ops[0]?.canonicalKey, 'DELETE /api/customers/{}')
})

console.log('digest')

check('same evidence twice is byte-identical; clipping recorded; cap held', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))
  const evidence: EvidenceRecord[] = [
    net('ev_030', 1, { response_body: { items } }),
    {
      id: 'ev_031',
      kind: 'ui_action',
      step: 1,
      at: '2026-08-31T00:00:00.010Z',
      data: { tool: 'click', page: '/items', element: { label: 'Next', role: 'button' } },
    },
  ]
  const a = buildDigest(evidence)
  const b = buildDigest(structuredClone(evidence))
  assert.equal(a.json, b.json)
  assert.ok(a.json.includes('_omitted'))
  assert.ok(a.digest.stats.clippedArrays >= 1)
  assert.ok(a.digest.stats.bytes <= 120_000)
  assert.ok(a.digest.timeline.every((event) => !('at' in event)))
  assert.equal(typeof a.digest.timeline[0]?.deltaMsFromAction, 'number')
})

check('digest lists blocked policy clicks without allowing Delete Me as an operation', () => {
  const evidence: EvidenceRecord[] = [
    policyBlock('ev_060', 2, 'Delete draft'),
    policyBlock('ev_061', 3, 'Delete Me'),
  ]
  const { digest } = buildDigest(evidence)
  assert.equal(digest.blockedActions.length, 2)
  assert.equal(digest.blockedActions[0]?.label, 'Delete draft')
  assert.equal(digest.blockedActions[0]?.verdict, 'block')
  assert.equal(digest.blockedActions[1]?.label, 'Delete Me')
})

console.log('assembler')

check('nine section outputs: malformed item dropped, unparseable section empty, document valid', () => {
  const validator = new SubmissionValidator(
    join(ROOT, 'miniCRM/benchmark/schemas/reconstruction-output.schema.json'),
  )
  const evidence = [{ kind: 'network_request', method: 'GET', path: '/api/x', status: 200 }]
  const factEv = [{ kind: 'ui_label', ui_text: 'Shipped' }, { kind: 'network_response', path: '/api/orders', status: 200 }]
  const result = assembleFromSectionItems({
    validator,
    sections: {
      operations: [
        { method: 'GET', path: '/api/x', evidence },
        { method: 'GET', path: '/api/y', extra_field: true, evidence },
      ],
      semantic_facts: [
        { meaning: 'status 40 is shipped', kind: 'enum_mapping', subject: 'order.statusId', value: 40, evidence: factEv },
        { meaning: 'id is the order id', kind: 'identifier_meaning', subject: 'order.id', value: { type: 'integer' }, evidence: factEv },
        { meaning: 'draft to confirmed', kind: 'state_transition', subject: 'order.statusId', value: { from: 10, to: [20] }, evidence: factEv },
        { meaning: 'version lock', kind: 'concurrency', subject: 'order.version', value: { type: 'integer' }, evidence: factEv },
        { meaning: 'csrf required', kind: 'auth', subject: 'header:X-CSRF-Token', value: { csrf: true }, evidence: factEv },
        { meaning: 'out of stock', kind: 'business_constraint', subject: 'POST /api/order-quotes', value: 'OUT_OF_STOCK', evidence: factEv },
        { meaning: 'q matches name', kind: 'query_semantics', subject: 'GET /api/customers?q', value: { matches: ['name'] }, evidence: factEv },
      ],
      dependencies: [
        {
          source_operation: 'POST /api/auth/login',
          target_operation: '*',
          source_field: 'Set-Cookie:sid',
          target_field: 'cookie:sid',
          kind: 'auth',
          evidence,
        },
      ],
      workflows: [
        {
          user_goal: 'sign in',
          steps: [{ operation: 'POST /api/auth/login', role: 'required_business' }],
          evidence: [{ kind: 'ui_action', page: '/login' }],
        },
      ],
      claims: [],
    },
  })
  const checked = validator.check(result.document)
  assert.equal(checked.valid, true, checked.errors.join('; '))
  const operations = result.document.operations as unknown[]
  assert.equal(operations.length, 1)
  assert.ok(result.dropped.some((d) => d.reason.includes('malformed') || d.reason.includes('additional')))
  const claims = result.document.claims as unknown[]
  assert.equal(claims.length, 0)
  const facts = result.document.semantic_facts as unknown[]
  assert.ok(facts.length >= 6)
  const deps = result.document.dependencies as unknown[]
  assert.equal(deps.length, 1)
  const wfs = result.document.workflows as unknown[]
  assert.equal(wfs.length, 1)
})

check('assembler keeps operations when display fields are missing or malformed', () => {
  const validator = new SubmissionValidator(
    join(ROOT, 'miniCRM/benchmark/schemas/reconstruction-output.schema.json'),
  )
  const evidence = [{ kind: 'network_request', method: 'GET', path: '/api/x', status: 200 }]
  const result = assembleFromSectionItems({
    validator,
    sections: {
      operations: [
        {
          method: 'GET',
          path: '/api/x',
          evidence,
          summary: 'Fetch x',
          authentication: 'session-cookie',
          confidence: 0.8,
        },
        {
          method: 'GET',
          path: '/api/y',
          evidence,
          summary: 12,
          authentication: true,
          confidence: 'high',
        },
      ],
    },
  })
  const operations = result.document.operations as Array<Record<string, unknown>>
  assert.equal(operations.length, 2, result.dropped.map((d) => d.reason).join('; '))
  const kept = operations.find((op) => op.path === '/api/x')
  assert.equal(kept?.summary, 'Fetch x')
  assert.equal(kept?.authentication, 'session-cookie')
  assert.equal(kept?.confidence, 0.8)
  const stripped = operations.find((op) => op.path === '/api/y')
  assert.equal('summary' in (stripped ?? {}), false)
  assert.equal('authentication' in (stripped ?? {}), false)
  assert.equal('confidence' in (stripped ?? {}), false)
})

check('assembler keeps miner DELETE claims from a blocked click', () => {
  const validator = new SubmissionValidator(
    join(ROOT, 'miniCRM/benchmark/schemas/reconstruction-output.schema.json'),
  )
  const evidence = [policyBlock('ev_070', 4, 'Delete draft')]
  const mined = mineTraffic(evidence, 1)
  const result = assembleFromClaims({
    claims: mined.claims,
    nextGapId: 1,
    evidence,
    validator,
  })
  assert.equal(result.dropped.length, 0, result.dropped.map((d) => d.reason).join('; '))
  const operations = result.document.operations as Array<Record<string, unknown>>
  assert.ok(operations.some((op) => op.method === 'DELETE' && String(op.path).includes('/api/orders/')))
  const workflows = result.document.workflows as Array<Record<string, unknown>>
  assert.equal(workflows.length, 1)
})

console.log('explorer intercept')

await checkAsync('submit_reconstruction is intercepted and does not reach the harness', async () => {
  let submitted = false
  const harness = {
    observe_page: async () => ({ ok: true }),
    click: async () => ({ ok: true }),
    fill: async () => ({ ok: true }),
    select: async () => ({ ok: true }),
    go_back: async () => ({ ok: true }),
    get_network_events: async () => ({ ok: true, events: [] }),
    submit_reconstruction: async () => {
      submitted = true
      return { ok: true, accepted: true }
    },
  }
  const result = await dispatchExploreTool({
    harness,
    name: 'submit_reconstruction',
    input: { reconstruction: { schema_version: '1.0.0' } },
    interceptSubmit: true,
  })
  assert.equal(submitted, false)
  assert.equal(result.intercepted, true)
  assert.equal(result.ok, true)
  assert.match(String(result.error), /assembled at the end/)
  assert.equal(INTERCEPT_MESSAGE.includes('assembled'), true)
})

console.log('budget assertion (ADR-21)')

check('stepBudgetSplit summing above 1.0 refuses to start', () => {
  const aae: AaeConfig = {
    rounds: { max: 2, stopWhenNewClaimsBelow: 5, stepBudgetSplit: [0.7, 0.5] },
    miner: { enabled: true },
    sweeper: { enabled: true },
    inquisitor: { enabled: true, maxExperimentsPerRound: 12 },
    extractors: { enabled: true, concurrency: 3 },
    verifier: { enabled: false },
    reasoning: { enabled: false, budgetTokens: 4000, roles: ['inquisitor'] },
  }
  assert.throws(() => validateAaeConfig(aae), /exceeds 1\.0/)
  assert.throws(() => computeRoundAllotments(200, [0.7, 0.5]), /1\.0/)
})

check('stepBudgetSplit length differing from rounds.max refuses to start', () => {
  const aae: AaeConfig = {
    rounds: { max: 2, stopWhenNewClaimsBelow: 5, stepBudgetSplit: [1] },
    miner: { enabled: true },
    sweeper: { enabled: true },
    inquisitor: { enabled: true, maxExperimentsPerRound: 12 },
    extractors: { enabled: true, concurrency: 3 },
    verifier: { enabled: false },
    reasoning: { enabled: false, budgetTokens: 4000, roles: ['inquisitor'] },
  }
  assert.throws(() => validateAaeConfig(aae), /rounds\.max/)
})

check('a valid split stays inside maxSteps minus the submit reserve', () => {
  const allotments = computeRoundAllotments(200, [0.65, 0.35])
  assert.equal(allotments.length, 2)
  const sum = allotments.reduce((a, b) => a + b, 0)
  assert.ok(sum <= 198)
  assert.equal(sum, 198)
})

check('AAE_ABLATE flips enabled and records names', () => {
  const aae: AaeConfig = {
    rounds: { max: 2, stopWhenNewClaimsBelow: 5, stepBudgetSplit: [0.65, 0.35] },
    miner: { enabled: true },
    sweeper: { enabled: true },
    inquisitor: { enabled: true, maxExperimentsPerRound: 12 },
    extractors: { enabled: true, concurrency: 3 },
    verifier: { enabled: false },
    reasoning: { enabled: false, budgetTokens: 4000, roles: ['inquisitor'] },
  }
  const { aae: next, ablated } = applyAblations(aae, 'miner,inquisitor')
  assert.equal(next.miner.enabled, false)
  assert.equal(next.inquisitor.enabled, false)
  assert.equal(next.sweeper.enabled, true)
  assert.deepEqual(ablated, ['miner', 'inquisitor'])
})

check('boards refuse a claim without evidence ids', () => {
  const boards = new Boards()
  const item = { method: 'GET', path: '/api/x', evidence: [{ kind: 'network_request' }] }
  const added = boards.addClaim({
    section: 'operations',
    canonicalKey: 'GET /api/x',
    item,
    evidenceIds: [],
    producedBy: 'miner',
    support: 'observed',
    round: 1,
  })
  assert.equal(added, null)
  assert.equal(boards.claims.length, 0)
})

console.log(failures === 0 ? '\nall aae self-tests passed' : `\n${failures} failing`)
process.exit(failures === 0 ? 0 : 1)
