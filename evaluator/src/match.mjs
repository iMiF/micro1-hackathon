// Step 3 of the evaluator algorithm (docs/05 §7): "Match -- Each prediction is
// matched against a ground-truth fact by type and canonical key." Everything
// here is exact-key set comparison: build a canonical string key for every
// ground-truth item and every predicted item using the rules in
// normalize.mjs, then TP = keys present on both sides, FP = predicted keys
// absent from ground truth, FN = ground-truth keys absent from predictions.
// "invalid" (docs/05 §3: fails schema validation, or has an empty/missing
// evidence block) is excluded from TP but still counts toward the category's
// precision denominator -- implemented as a fourth bucket alongside tp/fp/fn.
import { normalizeMethod, normalizePath, normalizeOperationRef, normalizeSubject, normalizeFieldRef, normalizeValue, normalizeBool, stableStringify } from './normalize.mjs';

function operationKey(op) {
  if (!op || typeof op.method !== 'string' || typeof op.path !== 'string') return null;
  return `${normalizeMethod(op.method)} ${normalizePath(op.path)}`;
}

function semanticFactKey(f) {
  if (!f || typeof f.kind !== 'string' || typeof f.subject !== 'string' || f.value === undefined) return null;
  return `${f.kind}||${normalizeSubject(f.subject)}||${stableStringify(normalizeValue(f.value))}`;
}

function dependencyKey(d) {
  if (!d || typeof d.source_operation !== 'string' || typeof d.target_operation !== 'string') return null;
  const sf = typeof d.source_field === 'string' ? normalizeFieldRef(d.source_field) : '';
  const tf = typeof d.target_field === 'string' ? normalizeFieldRef(d.target_field) : '';
  return `${normalizeOperationRef(d.source_operation)}||${sf}||${normalizeOperationRef(d.target_operation)}||${tf}`;
}

function workflowKey(w) {
  if (!w || !Array.isArray(w.steps) || w.steps.length === 0) return null;
  const seq = [];
  for (const step of w.steps) {
    if (!step || typeof step.operation !== 'string') return null;
    seq.push([normalizeOperationRef(step.operation), typeof step.role === 'string' ? step.role : '']);
  }
  return stableStringify(seq);
}

export const KEY_FNS = {
  operations: operationKey,
  semantic_facts: semanticFactKey,
  dependencies: dependencyKey,
  workflows: workflowKey,
};

/**
 * Generic matcher for the four "record" categories that require a non-empty
 * evidence block to be TP-eligible (operations, semantic_facts, dependencies,
 * workflows -- docs/05 §2: "evidence lives inside the fact"). Parameters are
 * handled separately by matchParameters() below because they are nested
 * inside operations and the evidence rule is not applied to them (see
 * evaluator/README.md "Known interpretation calls").
 *
 * @param predicted   raw array from the submission (doc[section] or [])
 * @param groundTruth array of {id, item} already scoped to the case (or full corpus)
 * @param section     one of 'operations' | 'semantic_facts' | 'dependencies' | 'workflows'
 * @param itemErrorsFor(index) -> string[] of schema error strings for predicted[index]
 */
export function matchRecords({ predicted, groundTruth, section, itemErrorsFor }) {
  const keyFn = KEY_FNS[section];
  const gtByKey = new Map();
  const gtWarnings = [];
  for (const g of groundTruth) {
    const key = keyFn(g.item);
    if (key === null) {
      gtWarnings.push(`ground-truth item ${g.id} in ${section} has no usable key -- this is a benchmark-artifact defect, not a submission error`);
      continue;
    }
    if (gtByKey.has(key)) {
      gtWarnings.push(`duplicate ground-truth key in ${section}: ${key} (ids ${gtByKey.get(key).id} and ${g.id})`);
      continue;
    }
    gtByKey.set(key, g);
  }

  const tp = [];
  const fp = [];
  const invalid = [];
  const matchedGtKeys = new Set();
  const seenPredictedKeys = new Set();

  predicted.forEach((raw, idx) => {
    const schemaErrs = itemErrorsFor(idx);
    const key = keyFn(raw);
    const hasEvidence = Array.isArray(raw && raw.evidence) && raw.evidence.length > 0;
    const reasons = [...schemaErrs];
    if (!hasEvidence) reasons.push('missing or empty evidence array');
    if (key === null) reasons.push('missing fields required to build a matching key');

    if (reasons.length > 0) {
      invalid.push({ index: idx, item: raw, key, reasons });
      return;
    }
    if (seenPredictedKeys.has(key)) return; // exact duplicate submission -- de-duplicated (ADR-12), not double counted
    seenPredictedKeys.add(key);

    const gt = gtByKey.get(key);
    if (gt && !matchedGtKeys.has(key)) {
      matchedGtKeys.add(key);
      tp.push({ index: idx, item: raw, key, ground_truth_id: gt.id });
    } else {
      fp.push({ index: idx, item: raw, key });
    }
  });

  const fn = [];
  for (const [key, gt] of gtByKey.entries()) {
    if (!matchedGtKeys.has(key)) fn.push({ key, ground_truth_id: gt.id, ground_truth: gt.item });
  }

  return { tp, fp, fn, invalid, gtWarnings, groundTruthCount: gtByKey.size };
}

/**
 * Parameters are scored as: operation + location + name + type + required
 * (docs/04 §3). Flattened out of every predicted operation regardless of
 * whether that operation itself was TP/FP/invalid at the Operations category
 * level -- a parameter's key already embeds its own (normalized) operation
 * reference, so a parameter nested under a wrong or unmatched operation
 * naturally fails to match any ground-truth parameter key on its own. No
 * evidence requirement is applied here (see README).
 */
export function matchParameters({ predictedOperations, groundTruthOperations, rawErrors, errorsUnderPath }) {
  function paramKey(opKey, p) {
    if (!opKey || !p || typeof p.name !== 'string' || typeof p.location !== 'string') return null;
    const type = typeof p.type === 'string' ? p.type : '';
    return `${opKey}|${p.location}|${p.name}|${type}|${normalizeBool(p.required)}`;
  }

  const gtParams = new Map();
  for (const { item: op } of groundTruthOperations) {
    const opKey = operationKey(op);
    for (const p of op.parameters || []) {
      const key = paramKey(opKey, p);
      if (key) gtParams.set(key, { operation: opKey, parameter: p });
    }
  }

  const tp = [];
  const fp = [];
  const invalid = [];
  const matched = new Set();
  const seen = new Set();

  predictedOperations.forEach((op, opIdx) => {
    const opKey = operationKey(op);
    (op && Array.isArray(op.parameters) ? op.parameters : []).forEach((p, pIdx) => {
      const paramPath = `/operations/${opIdx}/parameters/${pIdx}`;
      const schemaErrs = errorsUnderPath(rawErrors, paramPath).map((e) => `${e.instancePath} ${e.message}`);
      const key = paramKey(opKey, p);
      const reasons = [...schemaErrs];
      if (key === null) reasons.push('missing fields required to build a matching key (name/location) or unresolvable parent operation');

      if (reasons.length > 0) {
        invalid.push({ opIndex: opIdx, paramIndex: pIdx, item: p, reasons });
        return;
      }
      if (seen.has(key)) return;
      seen.add(key);

      if (gtParams.has(key) && !matched.has(key)) {
        matched.add(key);
        tp.push({ key, item: p });
      } else {
        fp.push({ key, item: p });
      }
    });
  });

  const fn = [];
  for (const [key, g] of gtParams.entries()) {
    if (!matched.has(key)) fn.push({ key, ground_truth: g });
  }

  return { tp, fp, fn, invalid, groundTruthCount: gtParams.size };
}

export { operationKey };
