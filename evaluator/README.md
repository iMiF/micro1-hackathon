# evaluator/

A deterministic evaluator for the MiniCRM API-reconstruction benchmark
(VARS -- Verified API Reconstruction Score). No LLM call, no embeddings, no
fuzzy/semantic matching anywhere in this package, on any step. Implements the
five-step algorithm from `docs/05-evaluation-and-metrics.md` §7:

1. **Validate** -- `src/schema.mjs`. Two tiers: a document-level check
   (required top-level keys present and array-typed, `schema_version ===
   "1.0.0"`, no stray root property) that zeroes the whole submission if it
   fails, and an item-level check (each `operations[]` / `semantic_facts[]` /
   `dependencies[]` / `workflows[]` / `claims[]` / `actions[]` entry against
   its own schema definition) that marks only that one entry `invalid`.
2. **Normalize** -- `src/normalize.mjs`. Method casing, path formatting,
   operation-reference shape, dependency field-reference prefixes, and the
   handful of `semantic_facts.value` object keys whose arrays are order-free
   sets. Every rule is a docs/04 §4 rule or an explicit, documented judgment
   call (see "Known interpretation calls" below) -- never a synonym lookup.
3. **Match** -- `src/match.mjs`. Builds a canonical string key per item per
   category and does exact-key set comparison: TP / FP / FN, plus a fourth
   bucket, `invalid`, for items that fail validation or lack a usable
   evidence block.
4. **Score** -- `src/score.mjs`. Precision/recall/F1 per category, VARS
   (weighted sum, weights from `config/weights.json`), and the
   submission-observable secondary metrics from docs/05 §4.
5. **Audit** -- `bin/evaluate.mjs` writes `evaluation.json` (scores) and
   `diff.json` (matched / missing / spurious / invalid, per docs/04 §7's own
   names for these four buckets, with enough of each item to see exactly what
   was credited).

## Running it

```
cd evaluator
npm install                 # once, installs ajv (JSON Schema draft-07 validation only)
npm test                    # the golden-test suite, see below

# score a real run against one case (the real per-run scoring mode -- docs/04 §6)
node bin/evaluate.mjs --submission path/to/reconstruction.json --case case-09-create-order-workflow

# score against the full, unfiltered ground-truth corpus (what the
# perfect-reconstruction golden test uses; ADR-8 case-filtering does not apply)
node bin/evaluate.mjs --submission ../miniCRM/benchmark/examples/perfect-reconstruction.json --all

# re-score an existing run under a weights vector nobody has frozen yet, no code change:
node bin/evaluate.mjs --submission run.json --case case-09-create-order-workflow --weights-file my-weights.json
```

`--submission` and (`--case <id>` xor `--all`) are the only required flags.
`node bin/evaluate.mjs --help` lists the rest. Every invocation reports VARS
under **all three** weight vectors (`frozen`, `rejected_balanced`,
`rejected_flat`) side by side, per ADR-13's obligation #2 -- `--weights-set`
only picks which one is called out as *the* `VARS` figure.

## Weights are config, not code

`config/weights.json` holds the three named vectors. Scoring the same run
under a fourth vector needs no code change: pass `--weights-file` pointing at
any JSON file shaped `{"vectors": {"my_name": {"operations":..., ...}}}`.

## Golden tests (`npm test`)

`tests/golden.test.mjs` implements, as executable assertions, all seven
mandatory tests from docs/05 §7, plus a few extra checks written while
verifying the design (see below). All 13 currently pass:

1. a valid exact match -> TP
2. a missing fact -> FN, doesn't affect precision
3. an extra fact -> FP, lowers precision
4. a fact with no evidence block (4a) / an evidence[].kind outside the
   allowed list (4b) -> invalid, not TP
5. a canonical-label mismatch ("sent" vs. ground truth "shipped") -> not TP
6. an invalid schema -> a zero case score, reason recorded (6: missing
   required top-level key; 6b: the submission isn't parseable JSON at all)
7. `miniCRM/benchmark/examples/perfect-reconstruction.json` -> **VARS = 100**,
   scored with `--all` against the full, unfiltered ground-truth corpus,
   0 FP / 0 FN / 0 invalid in every one of the five categories.

Extra tests, run for the same reason ADR-7/ADR-8 exist -- verify claims about
metrics by execution, not by reading:

- every one of the 15 real cases' own ground truth, copied verbatim into a
  submission (with `provenance` stripped and evidence attached, since ground
  truth cites source code and the schema forbids that), scores VARS = 100 for
  that case -- not just case-01, all fifteen.
- `header:` dependency field references are case-folded (HTTP header names
  are case-insensitive), `cookie:` ones are not (cookie names are
  case-sensitive) -- both directions are asserted, not just the one that
  happens to match.
- an agent-chosen path placeholder name that differs from the ground truth's
  ({orderId} vs. the published {id}) does **not** match -- names are exact,
  not generalized to a wildcard (see "Known interpretation calls").
- a "KNOWN FINDING" test documenting a real ground-truth ambiguity this
  evaluator surfaced by running, not reading (below).

## Known interpretation calls

The docs specify *what* is scored (docs/04 §3's "Scoring units" table) more
precisely than every edge case of *how equality is decided*. Where the docs
were silent, here is what was chosen and why -- flagged so the benchmark
owner can override any of these without archaeology:

- **Path placeholder names are wildcarded, not exact (reversed 2026-08-30).**
  This bullet used to say the opposite -- that docs/04 §1's closed set of
  three placeholder names made this a non-guessing game, so names were
  compared literally. That was correct when written, but docs/04 §4 rule 1
  was edited later the same day (in the commit that added the harness) to
  the opposite rule: erase placeholder names too, matching
  `tooling/browser/paths.ts`, because ground truth's own naming is
  inconsistent across resources (orders keep `:id` even nested, customers
  use `:customerId`/`:addressId` -- verified against the live route source,
  it's a real inconsistency in the target app, not sloppy ground truth) and
  an agent has no reliable way to always recover which one applies. This
  file's `src/normalize.mjs` was never updated to match that rule change and
  silently kept the old exact-name behavior -- caught 2026-08-30 by running
  the first real baseline (Haiku): a workflow that matched ground truth
  step-for-step except for one placeholder name scored zero anyway. Fixed by
  making `normalizePath`/`normalizeFieldRef` erase names the same way
  `paths.ts` does; see `tests/golden.test.mjs` for the regression tests
  (including one confirming this does not cause false collisions between
  genuinely different routes). Ground truth itself was not touched.
- **`query.` is a declared `dependencies[].*_field` prefix (added
  2026-08-30).** Missing from docs/04 §4 rule 6's list even though docs/04
  §3 already uses the same notation for `operations[].parameters`
  (`query.status: integer`) and `dep-country-to-regions` already used it
  (sourced from the real route, `request.query.country` in
  `miniCRM/apps/api/src/routes/geo.ts`). No code change was needed --
  `normalizeFieldRef` already left unrecognized prefixes untouched
  (case-sensitive), which is the correct behavior for `query.` too -- only
  the doc and the agent-facing prompt were missing it.
- **Evidence is required for TP eligibility on operations, semantic_facts,
  dependencies, and workflows, but *not* on parameters.** docs/05 §3 states
  the empty/invalid-evidence-is-`invalid` rule once, in the general "what F1
  means" section, not scoped to one category; docs/04 §3's "Scoring units"
  table has no separate evidence-bearing example for parameters, and
  requiring per-parameter evidence (rather than evidence on the parameter's
  parent operation) reads as an unreasonably fine bar. Does not affect golden
  test 7 (perfect-reconstruction.json has evidence everywhere).
- **`Dependencies and rules` category matching unit: docs/04 §3 vs. docs/05
  §3 disagree in wording, and this build follows docs/04 §3.** docs/04 §3's
  "Scoring units" table gives the dependencies unit as "source -> artifact ->
  consumer" (implemented here as the 4-tuple `source_operation +
  source_field + target_operation + target_field`, since two real
  ground-truth dependencies -- `dep-csrf-from-login` / `dep-csrf-from-session`
  -- are distinguished only by `source_operation`, so a 3-part key would
  wrongly collide them). docs/05 §3's weights table instead lists the unit as
  `"dependencies + business_constraint"`, which would imply also scoring
  `business_constraint`-kind `semantic_facts` (13 of them) a second time
  under this category -- double-counting a kind that docs/04 §3's own
  "Kinds of semantic facts" table already places under `semantic_facts`,
  scored there once at weight 0.35. Treated as imprecise phrasing in docs/05,
  not a second matching key, and **not fixed by editing either doc** --
  flagged here for the benchmark owner to resolve; ground truth and the
  schema were left untouched either way.
- **Workflow matching key is the ordered `(operation, role)` sequence after
  dropping `refresh` steps and mapping `auth` → `required_business` (ADR-16),**
  not including `depends_on` / `condition` / `description` / `user_goal`.
  Trailing post-success GETs are page aftermath, not a second user goal.
  Subsequence matching is rejected (one session-length workflow would then
  collect every one-step ground-truth row).
- **Parameter matching key is operation + location + name + type (ADR-16).**
  `required` stays in the schema as documentation and is not scored: a UI
  that always sends `page` does not make that parameter required.
- **JSONPath array indexes in dependency field refs collapse (ADR-16):**
  `$[].id` = `$.id` = `$[*].id`; `$.items[0].x` = `$.items[].x`. `*` as a
  target operation is not unified with a concrete endpoint.
- **`dependencies[].kind`** is not part of the dependency matching key
  (docs/04 §3's unit omits it); getting it wrong is currently free. Flagged,
  not fixed, for the same reason as the point above.
- **Secondary metrics** (docs/05 §4) not fully pinned down by the docs:
  `hallucination_rate = total FP / (TP+FP+invalid)` across the five VARS
  categories; `evidence_support_rate` is computed over
  operations+semantic_facts+dependencies+workflows+claims (the docs' own
  phrase is "facts and claims"); `coverage` groups ground-truth operations by
  the first `/api/<segment>` path component. `wall_time_ms` / `cost` /
  `tool_actions` are run-level facts this evaluator cannot see from
  `reconstruction.json` alone -- they pass through from an optional `--meta`
  file and are `null` otherwise, never invented. `valid_submission_rate` is
  an aggregate across many runs; this evaluator reports one run's
  `valid_submission: true/false`, which a runner can aggregate.

## Known findings (from running the evaluator, not reading the benchmark)

- **`wf-edit-customer` and `wf-archive-customer` collide under the declared
  workflow matching unit.** Both reduce to the identical key
  `[["GET /api/customers/{id}","auxiliary_lookup"],["PATCH
  /api/customers/{id}","required_business"]]` -- they differ only in
  `user_goal` and a step `description`, neither part of the matching key.
  `--all` mode reports 17 distinct ground-truth workflow keys, not the 18
  rows in `workflows.json`. **Inert for real scoring**: no single case's
  `workflow_ids` references both at once (`case-03` uses `wf-edit-customer`,
  `case-13` uses `wf-archive-customer`, never together), so this only shows
  up in full-corpus mode. Not fixed here -- widening the matching key (e.g.
  hashing the PATCH body's field set) or editing `workflows.json` are both
  ground-truth-authoring decisions, not this evaluator's to make
  unilaterally. See the "KNOWN FINDING" test in `tests/golden.test.mjs`,
  which pins the collision down and will fail loudly if it's ever resolved
  (a signal to update the test and this note, not a regression).

## What is deliberately *not* scored

Matches docs/04 §3's "Scoring units" table literally: `request_schema` /
`response_schema` / `success_status` / `authentication` / `summary` /
`error_responses` on operations, and the `claims[]` array itself, are
schema-validated (Tier B) but not compared field-by-field against ground
truth -- no scoring unit is defined for them. `actions[]` is optional in the
output schema and is not one of the five VARS categories (the five weights in
`config/weights.json` already sum to 1.0 without it).
