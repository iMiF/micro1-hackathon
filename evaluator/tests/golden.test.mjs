// The seven mandatory golden tests from docs/05-evaluation-and-metrics.md §7
// ("Evaluator golden tests"), plus two extra tests documenting things this
// build actually found by running the evaluator against the real benchmark
// artifacts, not by reading them (the standing rule from
// project_benchmark_defects.md / ADR-7 / ADR-8: verify by execution).
//
// Tests 1-6 use small, hand-built ground-truth scopes so each mechanism is
// isolated and the expected numbers are easy to check by hand. Test 7 runs
// the real miniCRM/benchmark/examples/perfect-reconstruction.json against the
// real, unfiltered ground-truth corpus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSchema, compileValidator } from '../src/schema.mjs';
import { loadGroundTruthCorpus, fullCorpusScope, loadCases, findCase, scopeToCase } from '../src/groundtruth.mjs';
import { readJson, resolveFromProject } from '../src/io.mjs';
import { evaluate } from '../bin/evaluate.mjs';

const schema = loadSchema();
const validator = compileValidator(schema);
const weightsConfig = readJson(resolveFromProject('evaluator', 'config', 'weights.json'));

function emptyDoc(overrides = {}) {
  return {
    schema_version: '1.0.0',
    operations: [],
    semantic_facts: [],
    dependencies: [],
    workflows: [],
    claims: [],
    ...overrides,
  };
}

function ev(kind = 'ui_label') {
  return [{ kind }];
}

function scopeWithFacts(facts) {
  return { operations: [], facts, dependencies: [], workflows: [], unknownIds: [], scope: 'test' };
}

function run(doc, scope) {
  return evaluate({ doc, parseError: null, validator, scope, weightsConfig, activeWeightsName: 'frozen', meta: null });
}

// --- Golden test 1: a valid exact match -> TP -----------------------------
test('golden 1: a valid exact match scores TP', () => {
  const scope = scopeWithFacts([{ id: 'sem-x', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'session cookie' }]);
  const doc = emptyDoc({
    semantic_facts: [{ id: 'p1', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'agent wording differs, key does not', evidence: ev('cookie') }],
  });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.semantic_facts;
  assert.equal(c.tp, 1);
  assert.equal(c.fp, 0);
  assert.equal(c.fn, 0);
  assert.equal(c.invalid, 0);
  assert.equal(c.precision, 1);
  assert.equal(c.recall, 1);
  assert.equal(c.f1, 1);
});

// --- Golden test 2: a missing fact -> FN, doesn't affect precision --------
test('golden 2: a missing fact scores FN and leaves precision untouched', () => {
  const scope = scopeWithFacts([
    { id: 'sem-a', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1' },
    { id: 'sem-b', kind: 'auth', subject: 'auth.csrf', value: 'X-CSRF-Token', meaning: 'm2' },
  ]);
  const doc = emptyDoc({
    semantic_facts: [{ id: 'p1', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1', evidence: ev('cookie') }],
  });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.semantic_facts;
  assert.equal(c.tp, 1);
  assert.equal(c.fn, 1);
  assert.equal(c.fp, 0);
  assert.equal(c.precision, 1, 'a missing fact must not lower precision');
  assert.equal(c.recall, 0.5);
});

// --- Golden test 3: an extra fact -> FP, lowers precision ------------------
test('golden 3: an extra (spurious) fact scores FP and lowers precision', () => {
  const scope = scopeWithFacts([{ id: 'sem-a', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1' }]);
  const doc = emptyDoc({
    semantic_facts: [
      { id: 'p1', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1', evidence: ev('cookie') },
      { id: 'p2', kind: 'auth', subject: 'auth.made_up', value: 'nope', meaning: 'invented', evidence: ev('cookie') },
    ],
  });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.semantic_facts;
  assert.equal(c.tp, 1);
  assert.equal(c.fp, 1);
  assert.equal(c.fn, 0);
  assert.equal(c.precision, 0.5);
  assert.equal(c.recall, 1);
});

// --- Golden test 4: no evidence / bad evidence kind -> invalid, not TP ----
test('golden 4a: a fact with an empty evidence array is invalid, not TP', () => {
  const scope = scopeWithFacts([{ id: 'sem-a', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1' }]);
  const doc = emptyDoc({
    semantic_facts: [{ id: 'p1', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1', evidence: [] }],
  });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.semantic_facts;
  assert.equal(c.tp, 0);
  assert.equal(c.invalid, 1);
  assert.equal(c.fn, 1, 'the ground-truth fact is still unmatched');
});

test('golden 4b: an evidence[].kind outside the allowed list is invalid, not TP', () => {
  const scope = scopeWithFacts([{ id: 'sem-a', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1' }]);
  const doc = emptyDoc({
    semantic_facts: [{ id: 'p1', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1', evidence: [{ kind: 'source_code_comment' }] }],
  });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.semantic_facts;
  assert.equal(c.tp, 0);
  assert.equal(c.invalid, 1);
  assert.equal(c.fn, 1);
});

// --- Golden test 5: a canonical-label mismatch is not accepted as TP ------
test('golden 5: "sent" does not match ground truth "shipped" (no alias table entry)', () => {
  const scope = scopeWithFacts([{ id: 'sem-status', kind: 'enum_mapping', subject: 'order.status_label', value: 'shipped', meaning: 'terminal state after Mark shipped' }]);
  const doc = emptyDoc({
    semantic_facts: [{ id: 'p1', kind: 'enum_mapping', subject: 'order.status_label', value: 'sent', meaning: 'agent believes this is the label', evidence: ev('ui_label') }],
  });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.semantic_facts;
  assert.equal(c.tp, 0, '"sent" must not be silently treated as "shipped"');
  assert.equal(c.fp, 1);
  assert.equal(c.fn, 1);
});

// --- Golden test 6: invalid schema -> zero case score, reason recorded ----
test('golden 6: a document missing a required top-level key scores zero, with the reason recorded', () => {
  const scope = scopeWithFacts([{ id: 'sem-a', kind: 'auth', subject: 'auth.cookie', value: 'sid', meaning: 'm1' }]);
  const doc = { schema_version: '1.0.0', operations: [], semantic_facts: [], dependencies: [], workflows: [] }; // no "claims"
  const { evaluation } = run(doc, scope);
  assert.equal(evaluation.validity.valid, false);
  assert.ok(evaluation.validity.errors.some((e) => e.includes('claims')), `expected a recorded reason mentioning "claims", got: ${JSON.stringify(evaluation.validity.errors)}`);
  assert.equal(evaluation.VARS, 0);
  for (const v of Object.values(evaluation.VARS_by_weights)) assert.equal(v, 0);
});

test('golden 6b: a JSON parse failure also scores zero, with the reason recorded', () => {
  const scope = scopeWithFacts([]);
  const { evaluation } = evaluate({ doc: null, parseError: 'Unexpected token } in JSON at position 42', validator, scope, weightsConfig, activeWeightsName: 'frozen', meta: null });
  assert.equal(evaluation.validity.valid, false);
  assert.ok(evaluation.validity.errors[0].includes('not valid JSON'));
  assert.equal(evaluation.VARS, 0);
});

// --- Golden test 7: perfect-reconstruction.json -> VARS = 100 -------------
test('golden 7: perfect-reconstruction.json scores VARS = 100 against the full ground-truth corpus', () => {
  const corpus = loadGroundTruthCorpus();
  const scope = fullCorpusScope(corpus);
  const doc = readJson(resolveFromProject('miniCRM', 'benchmark', 'examples', 'perfect-reconstruction.json'));
  const { evaluation, diff } = run(doc, scope);

  assert.equal(evaluation.validity.valid, true, JSON.stringify(evaluation.validity.errors));
  assert.equal(evaluation.VARS, 100, `VARS must be exactly 100, got ${evaluation.VARS}. Per-category: ${JSON.stringify(evaluation.categories, null, 2)}`);
  for (const [name, v] of Object.entries(evaluation.VARS_by_weights)) {
    assert.equal(v, 100, `VARS under weights "${name}" must also be 100 (F1=1 in every category makes VARS weight-independent), got ${v}`);
  }
  for (const key of ['operations', 'parameters', 'semantic_facts', 'dependencies', 'workflows']) {
    const c = evaluation.categories[key];
    assert.equal(c.fp, 0, `${key}: expected 0 FP, got ${c.fp}`);
    assert.equal(c.fn, 0, `${key}: expected 0 FN, got ${c.fn}`);
    assert.equal(c.invalid, 0, `${key}: expected 0 invalid, got ${c.invalid}`);
    assert.equal(c.f1, 1);
  }
  // Exact ground-truth counts, locked in so a future change to either the
  // ground-truth files or the evaluator's matching logic is caught here
  // rather than silently changing what "100" means.
  assert.equal(evaluation.categories.operations.tp, 26);
  assert.equal(evaluation.categories.semantic_facts.tp, 71);
  assert.equal(evaluation.categories.dependencies.tp, 22);
  // 17, not 18 -- see the "KNOWN FINDING" test below. This is not a bug in
  // perfect-reconstruction.json or in the evaluator; it is a real, disclosed
  // limitation of the "operation+role sequence" workflow matching unit.
  assert.equal(evaluation.categories.workflows.tp, 17);
  assert.equal(diff.categories.semantic_facts.matched.length, 71);
});

// --- Extra: documents a real finding surfaced by running the evaluator ----
test('KNOWN FINDING: wf-edit-customer and wf-archive-customer collide under the docs/04 §3 workflow matching unit', () => {
  // docs/04-benchmark-contract.md §3 defines the Workflows scoring unit as
  // "sequence of steps with roles". wf-edit-customer and wf-archive-customer
  // in miniCRM/benchmark/ground-truth/workflows.json both reduce to the exact
  // same key under that definition: [["GET /api/customers/{id}",
  // "auxiliary_lookup"], ["PATCH /api/customers/{id}", "required_business"]].
  // They differ only in user_goal and in a free-text step "description"
  // ("Body includes archived boolean and version"), neither of which is part
  // of the declared matching key.
  //
  // Verified by execution, not by reading: --all mode reports 17 distinct
  // ground-truth workflow keys, not the 18 rows in workflows.json (see golden
  // test 7's ground-truth count assertions above and the evaluator's
  // gtWarnings). This is disclosed here rather than fixed by widening the
  // matching key or editing ground truth -- both are ground-truth-authoring
  // decisions for the project owner, not something this evaluator should
  // decide unilaterally. In real per-case scoring this collision is inert:
  // no single case's workflow_ids references both ids at once (case-03 uses
  // wf-edit-customer, case-13 uses wf-archive-customer, never together), so
  // it only surfaces in --all / full-corpus mode.
  const corpus = loadGroundTruthCorpus();
  const wfA = corpus.workflows.find((w) => w.id === 'wf-edit-customer');
  const wfB = corpus.workflows.find((w) => w.id === 'wf-archive-customer');
  const shape = (w) => JSON.stringify(w.steps.map((s) => [s.operation, s.role]));
  assert.equal(shape(wfA), shape(wfB), 'if this assertion ever fails, the ground truth changed and this test (and its comment) are stale, not the fix');
});

// --- Extra: a real case, scored end to end with no synthetic fixtures -----
test('sanity: every case\'s own ground truth, copied verbatim into a submission, scores VARS = 100 for that case', () => {
  // Not one of the docs/05 §7 mandatory seven -- an extra regression check
  // exercising scopeToCase() against all 15 real cases (not just the small
  // hand-built fixtures above), confirming ADR-8-excluded facts never leak
  // into a case's scope and that every case's ids resolve.
  const corpus = loadGroundTruthCorpus();
  const cases = loadCases();
  const toSubmissionItem = (item) => {
    const { provenance, ...rest } = item;
    return { ...rest, evidence: item.evidence && item.evidence.length ? item.evidence : ev('network_request') };
  };
  for (const caseObj of cases) {
    const scope = scopeToCase(corpus, caseObj);
    assert.equal(scope.unknownIds.length, 0, `case ${caseObj.id} has unresolved ground-truth ids: ${scope.unknownIds}`);
    const doc = emptyDoc({
      operations: scope.operations.map(toSubmissionItem),
      semantic_facts: scope.facts.map(toSubmissionItem),
      dependencies: scope.dependencies.map(toSubmissionItem),
      workflows: scope.workflows.map(toSubmissionItem),
    });
    const { evaluation } = run(doc, scope);
    assert.equal(evaluation.validity.valid, true, `case ${caseObj.id}: ${JSON.stringify(evaluation.validity.errors)}`);
    assert.equal(evaluation.VARS, 100, `case ${caseObj.id}: ${JSON.stringify(evaluation.categories, null, 2)}`);
  }
});

test('dependency field references: header: is case-folded, cookie: is not (RFC 7230 vs RFC 6265)', () => {
  const scope = { operations: [], facts: [], dependencies: [
    { id: 'dep-a', source_operation: 'POST /api/auth/login', source_field: '$.csrfToken', target_operation: '*', target_field: 'header:X-CSRF-Token' },
    { id: 'dep-b', source_operation: 'POST /api/auth/login', source_field: 'Set-Cookie:sid', target_operation: '*', target_field: 'cookie:sid' },
  ], workflows: [], unknownIds: [], scope: 'test' };
  const doc = emptyDoc({
    dependencies: [
      { id: 'q1', source_operation: 'post /api/auth/login', source_field: '$.csrfToken', target_operation: '*', target_field: 'HEADER:x-csrf-token', evidence: ev('header') },
      { id: 'q2', source_operation: 'POST /api/auth/login', source_field: 'Set-Cookie:sid', target_operation: '*', target_field: 'cookie:SID', evidence: ev('cookie') },
    ],
  });
  const { evaluation, diff } = run(doc, scope);
  const c = evaluation.categories.dependencies;
  assert.equal(c.tp, 1, 'header:X-CSRF-Token must match header:x-csrf-token (case-insensitive header name)');
  assert.equal(c.fp, 1, 'cookie:SID must NOT match cookie:sid (cookie names are case-sensitive)');
  assert.equal(diff.categories.dependencies.matched[0].ground_truth_id, 'dep-a');
});

test('operation path placeholder names must match exactly -- {orderId} does not match ground truth {id}', () => {
  // docs/04 §1 publishes the placeholder convention ({id}, {customerId},
  // {addressId}) as fixed vocabulary, not something the agent has to guess;
  // the evaluator therefore does NOT generalize "{anything}" to one wildcard
  // token when building an operation's canonical key. An agent that departs
  // from the published names is scored as a miss, not silently forgiven.
  const scope = { operations: [{ id: 'op-a', method: 'GET', path: '/api/orders/{id}' }], facts: [], dependencies: [], workflows: [], unknownIds: [], scope: 'test' };
  const doc = emptyDoc({ operations: [{ method: 'GET', path: '/api/orders/{orderId}', evidence: ev('network_request') }] });
  const { evaluation } = run(doc, scope);
  const c = evaluation.categories.operations;
  assert.equal(c.tp, 0);
  assert.equal(c.fp, 1);
  assert.equal(c.fn, 1);
});
