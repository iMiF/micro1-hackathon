// Step 1 of the evaluator algorithm (docs/05 §7): "Validate -- JSON Schema,
// types, required keys, validity of nested evidence objects. Invalid output
// doesn't score; the reason is recorded."
//
// Two tiers, both driven by one ajv pass over the whole document:
//
//   Tier A (document-level): the submission isn't shaped like a reconstruction
//   at all -- a required top-level key is missing or the wrong type,
//   schema_version isn't "1.0.0", or there's a stray top-level property
//   (additionalProperties: false at the root). A Tier A failure invalidates
//   the whole submission: every category scores 0, VARS is 0. This is golden
//   test "an invalid schema -> a zero case score, with the reason recorded"
//   (docs/05 §7).
//
//   Tier B (item-level): a single entry inside operations / semantic_facts /
//   dependencies / workflows / claims / actions fails its own definition
//   (missing required field, bad enum, additionalProperties violation, a
//   malformed nested evidence object). That one entry is "invalid" -- excluded
//   from TP, still counted in its category's precision denominator -- and
//   every other entry is scored normally. This is golden test "a fact with no
//   evidence block, or evidence[].kind outside the allowed list -> invalid,
//   not TP" (the "no evidence block" half of that sentence is a business rule
//   layered on top in src/match.mjs, not an ajv error -- the schema itself
//   allows omitting evidence).
import Ajv from 'ajv';
import { readJson, resolveFromProject } from './io.mjs';

export const SCHEMA_PATH = resolveFromProject(
  'miniCRM',
  'benchmark',
  'schemas',
  'reconstruction-output.schema.json',
);

export function loadSchema() {
  return readJson(SCHEMA_PATH);
}

export function compileValidator(schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

const REQUIRED_SECTIONS = ['schema_version', 'operations', 'semantic_facts', 'dependencies', 'workflows', 'claims'];
const ARRAY_SECTIONS = ['operations', 'semantic_facts', 'dependencies', 'workflows', 'claims', 'actions'];
const ITEM_PATH_RE = /^\/(operations|semantic_facts|dependencies|workflows|claims|actions)\/(\d+)/;

/**
 * Runs the compiled validator once and classifies the result into Tier A /
 * Tier B as described above.
 *
 * @returns {{
 *   tierA: {valid: boolean, errors: string[]},
 *   rawErrors: object[],           // full ajv error objects, for errorsUnderPath()
 *   itemErrors: Map<string, string[]>, // "section:index" -> readable error strings
 * }}
 */
export function validateSubmission(doc, validator) {
  const structurallyAnObject = doc !== null && typeof doc === 'object' && !Array.isArray(doc);
  const ajvValid = structurallyAnObject ? validator(doc) : false;
  const rawErrors = structurallyAnObject && !ajvValid ? validator.errors || [] : [];

  const tierAErrors = [];
  if (!structurallyAnObject) {
    tierAErrors.push('submission root is not a JSON object');
  } else {
    for (const key of REQUIRED_SECTIONS) {
      if (!(key in doc)) tierAErrors.push(`missing required top-level key: ${key}`);
    }
    if ('schema_version' in doc && doc.schema_version !== '1.0.0') {
      tierAErrors.push(`schema_version must be "1.0.0", got ${JSON.stringify(doc.schema_version)}`);
    }
    for (const key of ARRAY_SECTIONS) {
      if (key in doc && !Array.isArray(doc[key])) tierAErrors.push(`${key} must be an array, got ${typeof doc[key]}`);
    }
    for (const err of rawErrors) {
      if (err.instancePath === '') {
        const extra = err.params && err.params.additionalProperty ? ` (${err.params.additionalProperty})` : '';
        tierAErrors.push(`root: ${err.message}${extra}`);
      }
    }
  }

  const itemErrors = new Map();
  for (const err of rawErrors) {
    const m = ITEM_PATH_RE.exec(err.instancePath);
    if (!m) continue;
    const key = `${m[1]}:${m[2]}`;
    if (!itemErrors.has(key)) itemErrors.set(key, []);
    itemErrors.get(key).push(`${err.instancePath} ${err.message}`);
  }

  return {
    tierA: { valid: tierAErrors.length === 0, errors: tierAErrors },
    rawErrors,
    itemErrors,
  };
}

export function itemErrorStrings(itemErrors, section, index) {
  return itemErrors.get(`${section}:${index}`) || [];
}

/** ajv error objects whose instancePath falls under a given prefix, e.g.
 * "/operations/3/parameters/0" -- used to check a nested parameter entry's
 * own validity without a separate per-parameter schema compile. */
export function errorsUnderPath(rawErrors, prefix) {
  return rawErrors.filter((e) => e.instancePath === prefix || e.instancePath.startsWith(prefix + '/'));
}
