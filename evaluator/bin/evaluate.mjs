#!/usr/bin/env node
// CLI entrypoint. Runs the five-step algorithm from docs/05-evaluation-and-metrics.md
// §7 (Validate -> Normalize -> Match -> Score -> Audit) against one
// reconstruction.json, either scoped to one benchmark case (real scoring:
// docs/04 §6) or against the full ground-truth corpus (the
// perfect-reconstruction.json golden test in docs/05 §7, and general sanity
// checks). No LLM call, no network call, no embeddings anywhere in this file
// or anything it imports.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { readJson, resolveFromProject, EVALUATOR_ROOT } from '../src/io.mjs';
import { loadSchema, compileValidator, validateSubmission, itemErrorStrings, errorsUnderPath } from '../src/schema.mjs';
import { loadGroundTruthCorpus, loadCases, findCase, scopeToCase, fullCorpusScope } from '../src/groundtruth.mjs';
import { matchRecords, matchParameters } from '../src/match.mjs';
import { buildCategory, computeVars, secondaryMetrics, CATEGORY_KEYS } from '../src/score.mjs';

function parseArgs(argv) {
  const args = { weightsSet: null, out: null, meta: null, case: null, all: false, submission: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--submission') args.submission = argv[++i];
    else if (a === '--case') args.case = argv[++i];
    else if (a === '--all') args.all = true;
    else if (a === '--weights-set') args.weightsSet = argv[++i];
    else if (a === '--weights-file') args.weightsFile = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--meta') args.meta = argv[++i];
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

const HELP = `Usage: node bin/evaluate.mjs --submission <reconstruction.json> (--case <case-id> | --all) [options]

  --submission <path>   Path to the agent/baseline reconstruction.json to score. Required.
  --case <case-id>      Score against one case's scoped ground truth (real per-run scoring;
                         docs/04 §6). Mutually exclusive with --all.
  --all                 Score against the full, unfiltered ground-truth corpus (used by the
                         perfect-reconstruction golden test; ADR-8 case filtering does not apply).
  --weights-set <name>  Named vector from config/weights.json to use as the *active* VARS figure
                         (default: config/weights.json "active", currently "frozen"/ADR-13). All
                         three vectors (frozen, rejected_balanced, rejected_flat) are always computed
                         and reported side by side (ADR-13 obligation #2), regardless of this flag.
  --weights-file <path> Use a weights vector from an arbitrary JSON file instead of config/weights.json
                         (same {"vectors": {...}} shape). Lets you re-score a run under a weight
                         vector nobody has frozen yet, with no code change.
  --meta <path>         Optional JSON file with {"wall_time_ms":n,"cost":n,"tool_actions":n} to echo
                         into the secondary-metrics block. The evaluator never invents these.
  --out <dir>           Directory to write evaluation.json and diff.json into (default: alongside
                         --submission).
  --quiet                Suppress the human-readable stdout summary; still writes the JSON files.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.submission) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }
  if (!args.case && !args.all) {
    throw new Error('Specify either --case <case-id> or --all.');
  }
  if (args.case && args.all) {
    throw new Error('--case and --all are mutually exclusive.');
  }

  const schema = loadSchema();
  const validator = compileValidator(schema);

  let doc = null;
  let parseError = null;
  try {
    doc = JSON.parse(readFileSync(args.submission, 'utf8'));
  } catch (err) {
    parseError = err.message;
  }

  const corpus = loadGroundTruthCorpus();
  let scope;
  if (args.all) {
    scope = fullCorpusScope(corpus);
  } else {
    const cases = loadCases();
    const caseObj = findCase(cases, args.case);
    scope = scopeToCase(corpus, caseObj);
  }

  const weightsConfig = args.weightsFile ? readJson(path.resolve(args.weightsFile)) : readJson(resolveFromProject('evaluator', 'config', 'weights.json'));
  const activeWeightsName = args.weightsSet || weightsConfig.active || 'frozen';
  if (!weightsConfig.vectors[activeWeightsName]) {
    throw new Error(`Unknown weights set "${activeWeightsName}". Known: ${Object.keys(weightsConfig.vectors).join(', ')}`);
  }

  const meta = args.meta ? readJson(path.resolve(args.meta)) : null;

  const result = evaluate({ doc, parseError, validator, scope, weightsConfig, activeWeightsName, meta });

  const outDir = args.out ? path.resolve(args.out) : path.dirname(path.resolve(args.submission));
  mkdirSync(outDir, { recursive: true });
  const evalPath = path.join(outDir, 'evaluation.json');
  const diffPath = path.join(outDir, 'diff.json');
  writeFileSync(evalPath, JSON.stringify(result.evaluation, null, 2) + '\n');
  writeFileSync(diffPath, JSON.stringify(result.diff, null, 2) + '\n');

  if (!args.quiet) {
    printSummary(result.evaluation, evalPath, diffPath);
  }

  process.exit(result.evaluation.validity.valid ? 0 : 1);
}

function zeroCategory() {
  return { matches: { tp: [], fp: [], fn: [], invalid: [], groundTruthCount: 0 }, metrics: { tp: 0, fp: 0, fn: 0, invalid: 0, precision: 1, recall: 1, f1: 0 } };
}

export function evaluate({ doc, parseError, validator, scope, weightsConfig, activeWeightsName, meta }) {
  if (parseError) {
    const categories = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, zeroCategory()]));
    const evaluation = {
      scope: scope.scope,
      validity: { valid: false, errors: [`submission is not valid JSON: ${parseError}`] },
      categories: summarizeCategories(categories),
      VARS: 0,
      VARS_by_weights: Object.fromEntries(Object.keys(weightsConfig.vectors).map((k) => [k, 0])),
      active_weights: activeWeightsName,
      secondary_metrics: { hallucination_rate: 0, evidence_support_rate: null, coverage: null, valid_submission: false, wall_time_ms: null, cost: null, tool_actions: null, note: 'submission failed to parse as JSON; no metrics could be computed' },
    };
    return { evaluation, diff: { scope: scope.scope, valid: false, errors: evaluation.validity.errors, categories: {} } };
  }

  const { tierA, rawErrors, itemErrors } = validateSubmission(doc, validator);

  if (!tierA.valid) {
    const categories = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, zeroCategory()]));
    const evaluation = {
      scope: scope.scope,
      validity: { valid: false, errors: tierA.errors },
      categories: summarizeCategories(categories),
      VARS: 0,
      VARS_by_weights: Object.fromEntries(Object.keys(weightsConfig.vectors).map((k) => [k, 0])),
      active_weights: activeWeightsName,
      secondary_metrics: { hallucination_rate: 0, evidence_support_rate: null, coverage: null, valid_submission: false, wall_time_ms: null, cost: null, tool_actions: null, note: 'submission failed document-level (Tier A) schema validation; no per-category metrics could be computed' },
    };
    return { evaluation, diff: { scope: scope.scope, valid: false, errors: tierA.errors, categories: {} } };
  }

  const gtPairs = (arr) => arr.map((item) => ({ id: item.id, item }));

  const categories = {
    operations: buildCategory(
      matchRecords({
        predicted: doc.operations,
        groundTruth: gtPairs(scope.operations),
        section: 'operations',
        itemErrorsFor: (idx) => itemErrorStrings(itemErrors, 'operations', idx),
      }),
    ),
    semantic_facts: buildCategory(
      matchRecords({
        predicted: doc.semantic_facts,
        groundTruth: gtPairs(scope.facts),
        section: 'semantic_facts',
        itemErrorsFor: (idx) => itemErrorStrings(itemErrors, 'semantic_facts', idx),
      }),
    ),
    dependencies: buildCategory(
      matchRecords({
        predicted: doc.dependencies,
        groundTruth: gtPairs(scope.dependencies),
        section: 'dependencies',
        itemErrorsFor: (idx) => itemErrorStrings(itemErrors, 'dependencies', idx),
      }),
    ),
    workflows: buildCategory(
      matchRecords({
        predicted: doc.workflows,
        groundTruth: gtPairs(scope.workflows),
        section: 'workflows',
        itemErrorsFor: (idx) => itemErrorStrings(itemErrors, 'workflows', idx),
      }),
    ),
    parameters: buildCategory(
      matchParameters({
        predictedOperations: doc.operations,
        groundTruthOperations: gtPairs(scope.operations),
        rawErrors,
        errorsUnderPath,
      }),
    ),
  };

  const varsByWeights = {};
  for (const name of Object.keys(weightsConfig.vectors)) {
    varsByWeights[name] = computeVars(categories, weightsConfig.vectors[name]);
  }

  const secondary = secondaryMetrics({ categories, doc, groundTruthScope: scope, tierAValid: true, meta });

  const evaluation = {
    scope: scope.scope,
    unknown_ground_truth_ids: scope.unknownIds,
    validity: { valid: true, errors: [] },
    categories: summarizeCategories(categories),
    VARS: varsByWeights[activeWeightsName],
    VARS_by_weights: varsByWeights,
    active_weights: activeWeightsName,
    secondary_metrics: secondary,
  };

  const diff = {
    scope: scope.scope,
    valid: true,
    categories: Object.fromEntries(
      CATEGORY_KEYS.map((key) => [
        key,
        {
          matched: categories[key].matches.tp,
          missing: categories[key].matches.fn,
          spurious: categories[key].matches.fp,
          invalid: categories[key].matches.invalid,
          ground_truth_warnings: categories[key].matches.gtWarnings || [],
        },
      ]),
    ),
  };

  return { evaluation, diff };
}

function summarizeCategories(categories) {
  const out = {};
  for (const key of CATEGORY_KEYS) {
    const c = categories[key];
    out[key] = { ...c.metrics, ground_truth_count: c.matches.groundTruthCount };
  }
  return out;
}

function printSummary(evaluation, evalPath, diffPath) {
  const lines = [];
  lines.push(`scope: ${evaluation.scope}`);
  lines.push(`valid submission: ${evaluation.validity.valid}`);
  if (!evaluation.validity.valid) {
    lines.push(`  reasons: ${evaluation.validity.errors.join('; ')}`);
  }
  lines.push(`VARS (${evaluation.active_weights}): ${evaluation.VARS.toFixed(2)}`);
  for (const [name, v] of Object.entries(evaluation.VARS_by_weights)) {
    if (name !== evaluation.active_weights) lines.push(`  VARS (${name}): ${v.toFixed(2)}`);
  }
  lines.push('per-category precision / recall / F1:');
  for (const key of CATEGORY_KEYS) {
    const c = evaluation.categories[key];
    lines.push(`  ${key.padEnd(15)} P=${c.precision.toFixed(3)} R=${c.recall.toFixed(3)} F1=${c.f1.toFixed(3)}  (tp=${c.tp} fp=${c.fp} fn=${c.fn} invalid=${c.invalid} gt=${c.ground_truth_count})`);
  }
  lines.push(`hallucination_rate: ${evaluation.secondary_metrics.hallucination_rate.toFixed(3)}`);
  lines.push(`evidence_support_rate: ${evaluation.secondary_metrics.evidence_support_rate}`);
  lines.push(`coverage: ${evaluation.secondary_metrics.coverage}`);
  lines.push(`wrote: ${evalPath}`);
  lines.push(`wrote: ${diffPath}`);
  process.stdout.write(lines.join('\n') + '\n');
}

import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`error: ${err.stack || err.message}\n`);
    process.exit(2);
  });
}
