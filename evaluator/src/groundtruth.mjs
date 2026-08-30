// Loads miniCRM/benchmark/ground-truth/*.json and miniCRM/benchmark/cases.json,
// and scopes them to either one case (the real per-run scoring mode -- docs/04
// §6 "Evaluate: invokes the deterministic evaluator with the case's ground
// truth") or the full corpus (used to run the perfect-reconstruction golden
// test from docs/05 §7, which explicitly checks against "all 71 ground-truth
// facts", not a case subset).
//
// ADR-8 ("a case only scores browser-observable facts") is NOT re-implemented
// here: it is already baked into cases.json's ground_truth_fact_ids /
// workflow_ids, which is why case mode and full-corpus mode read different
// numbers of facts for the same underlying files.
import { readJson, resolveFromProject } from './io.mjs';

const GT_DIR = ['miniCRM', 'benchmark', 'ground-truth'];

export function loadGroundTruthCorpus() {
  const api = readJson(resolveFromProject(...GT_DIR, 'api.json'));
  const semantics = readJson(resolveFromProject(...GT_DIR, 'semantics.json'));
  const dependencies = readJson(resolveFromProject(...GT_DIR, 'dependencies.json'));
  const workflows = readJson(resolveFromProject(...GT_DIR, 'workflows.json'));
  const manifest = readJson(resolveFromProject(...GT_DIR, 'manifest.json'));
  return {
    manifest,
    operations: api.operations,
    facts: semantics.facts,
    dependencies: dependencies.dependencies,
    workflows: workflows.workflows,
  };
}

export function loadCases() {
  return readJson(resolveFromProject('miniCRM', 'benchmark', 'cases.json')).cases;
}

export function findCase(cases, caseId) {
  const c = cases.find((x) => x.id === caseId);
  if (!c) {
    const known = cases.map((x) => x.id).join(', ');
    throw new Error(`Unknown case id "${caseId}". Known cases: ${known}`);
  }
  return c;
}

/**
 * Scopes the full ground-truth corpus down to what a single case's
 * ground_truth_fact_ids / workflow_ids actually reference. ids are looked up
 * by matching against every ground-truth file's own id set, so a case's flat
 * id list is routed to the right ground-truth file without guessing from the
 * id's textual prefix.
 */
export function scopeToCase(corpus, caseObj) {
  const opById = new Map(corpus.operations.map((o) => [o.id, o]));
  const factById = new Map(corpus.facts.map((f) => [f.id, f]));
  const depById = new Map(corpus.dependencies.map((d) => [d.id, d]));
  const wfById = new Map(corpus.workflows.map((w) => [w.id, w]));

  const operations = [];
  const facts = [];
  const dependencies = [];
  const unknownIds = [];

  for (const id of caseObj.ground_truth_fact_ids || []) {
    if (opById.has(id)) operations.push(opById.get(id));
    else if (factById.has(id)) facts.push(factById.get(id));
    else if (depById.has(id)) dependencies.push(depById.get(id));
    else unknownIds.push(id);
  }

  const workflows = [];
  for (const id of caseObj.workflow_ids || []) {
    if (wfById.has(id)) workflows.push(wfById.get(id));
    else unknownIds.push(id);
  }

  return { operations, facts, dependencies, workflows, unknownIds, scope: `case:${caseObj.id}` };
}

export function fullCorpusScope(corpus) {
  return {
    operations: corpus.operations,
    facts: corpus.facts,
    dependencies: corpus.dependencies,
    workflows: corpus.workflows,
    unknownIds: [],
    scope: 'all',
  };
}
