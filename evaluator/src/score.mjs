// Step 4 of the evaluator algorithm (docs/05 §7): "Score -- precision, recall,
// F1 per category; hallucination rate; VARS."
//
// precision = TP / (TP + FP + invalid)   -- docs/05 §3: invalid items "do not
//             count as TP, but are counted in the precision denominator"
// recall    = TP / (TP + FN)
// F1        = harmonic mean of precision and recall
//
// Convention for the 0/0 cases (documented rather than left implicit):
//   TP+FP+invalid == 0  -> precision = 1 (nothing predicted, nothing to be wrong about)
//   TP+FN == 0          -> recall = 1    (nothing to find, nothing missed)
//   both                -> F1 = 1 (vacuously perfect: empty ground truth, empty submission)

export function categoryMetrics({ tp, fp, fn, invalid }) {
  const tpN = tp.length;
  const fpN = fp.length;
  const fnN = fn.length;
  const invalidN = invalid.length;
  const predictedDenominator = tpN + fpN + invalidN;
  const precision = predictedDenominator === 0 ? 1 : tpN / predictedDenominator;
  const recallDenominator = tpN + fnN;
  const recall = recallDenominator === 0 ? 1 : tpN / recallDenominator;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp: tpN, fp: fpN, fn: fnN, invalid: invalidN, precision, recall, f1 };
}

/** Wraps a raw matchRecords()/matchParameters() result into { matches, metrics }.
 * `matches` keeps the item-level arrays (for diff.json and for secondary
 * metrics like coverage); `metrics` is the scalar summary. Kept as two
 * separate objects, deliberately, so a metrics field never shadows a
 * same-named array of raw matches. */
export function buildCategory(matchResult) {
  return { matches: matchResult, metrics: categoryMetrics(matchResult) };
}

const CATEGORY_KEYS = ['operations', 'parameters', 'semantic_facts', 'dependencies', 'workflows'];

export function computeVars(categories, weights) {
  let sum = 0;
  let weightSum = 0;
  for (const key of CATEGORY_KEYS) {
    const w = weights[key];
    if (typeof w !== 'number') throw new Error(`weights vector is missing category "${key}"`);
    weightSum += w;
    sum += w * categories[key].metrics.f1;
  }
  if (Math.abs(weightSum - 1) > 1e-9) {
    throw new Error(`weights vector must sum to 1.0, got ${weightSum}`);
  }
  // Round away IEEE-754 summation noise (e.g. 0.15+0.15+0.35+0.20+0.15 landing
  // on 0.9999999999999999 instead of 1) without discarding real precision --
  // VARS is a 0-100 figure, so 1e-9 is nine decimal places of real headroom.
  return Math.round(100 * sum * 1e9) / 1e9;
}

/**
 * Secondary metrics (docs/05 §4) computable from the submission alone --
 * hallucination rate, evidence support rate, coverage, valid submission.
 * Wall time / cost / tool actions are run-level facts the evaluator never
 * observes (it only ever sees reconstruction.json); they are passed through
 * from an optional --meta file and left null otherwise, never invented.
 */
export function secondaryMetrics({ categories, doc, groundTruthScope, tierAValid, meta }) {
  let totalFp = 0;
  let totalPredictedDenom = 0;
  for (const key of CATEGORY_KEYS) {
    const m = categories[key].metrics;
    totalFp += m.fp;
    totalPredictedDenom += m.tp + m.fp + m.invalid;
  }
  const hallucinationRate = totalPredictedDenom === 0 ? 0 : totalFp / totalPredictedDenom;

  const evidenceSections = ['operations', 'semantic_facts', 'dependencies', 'workflows', 'claims'];
  let evidenceTotal = 0;
  let evidenceSupported = 0;
  if (doc && typeof doc === 'object') {
    for (const section of evidenceSections) {
      const arr = Array.isArray(doc[section]) ? doc[section] : [];
      for (const item of arr) {
        evidenceTotal += 1;
        if (item && Array.isArray(item.evidence) && item.evidence.length > 0) evidenceSupported += 1;
      }
    }
  }
  const evidenceSupportRate = evidenceTotal === 0 ? null : evidenceSupported / evidenceTotal;

  function operationGroup(p) {
    const m = /^\/api\/([^/]+)/.exec(p || '');
    return m ? m[1] : p || '(unknown)';
  }
  const gtGroups = new Set(groundTruthScope.operations.map((o) => operationGroup(o.path)));
  const foundGroups = new Set(categories.operations.matches.tp.map((t) => operationGroup(t.item.path)));
  const coverage = gtGroups.size === 0 ? null : [...foundGroups].filter((g) => gtGroups.has(g)).length / gtGroups.size;

  return {
    hallucination_rate: hallucinationRate,
    evidence_support_rate: evidenceSupportRate,
    coverage,
    valid_submission: tierAValid,
    wall_time_ms: meta && typeof meta.wall_time_ms === 'number' ? meta.wall_time_ms : null,
    cost: meta && typeof meta.cost === 'number' ? meta.cost : null,
    tool_actions: meta && typeof meta.tool_actions === 'number' ? meta.tool_actions : null,
    note: 'wall_time_ms/cost/tool_actions are run-level facts the evaluator cannot observe from reconstruction.json alone; supply them via --meta to have them echoed here. valid_submission_rate (docs/05 §4) is an aggregate across many runs and is a runner-level metric, not computed here.',
  };
}

export { CATEGORY_KEYS };
