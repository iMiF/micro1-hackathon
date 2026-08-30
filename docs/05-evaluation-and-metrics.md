# 05. Evaluation and metrics

> **Status:** draft (evaluator not implemented; weights need approval — ADR-2)
> **Updated:** 2026-08-29
> **Source of truth:** brief §"How to evaluate your solution"; `miniCRM/benchmark/schemas/reconstruction-output.schema.json`
> **Maps to criteria:** Measured Improvement (15), Reproducibility (15)

---

## 1. What the brief requires and what we do

The brief allows proposing our own rubric if the standard form fits poorly:

> "You run this evaluation yourself. If the format above fits your task poorly, design your own
> clear scoring rubric and propose it, so the judges can use it to assess your workflow."

We use that right — but we **add to**, not replace, the standard form. The report will include
both: our own primary metric and the brief's standard table with human time and cost.

---

## 2. Why meaning can be scored without an LLM

Free text like "seems to update an order after shipment" can't be used as the primary scoring
object: a deterministic evaluator has no obligation to understand that this is close to "marks an
order as shipped." Instead, the agent submits a **machine-readable fact**:

```json
{
  "semantic_facts": [{
    "id": "fact-order-status-40",
    "kind": "enum_mapping",
    "subject": "order.status_id",
    "value": 40,
    "meaning": "Order is shipped.",
    "confidence": 0.96,
    "evidence": [
      {"kind": "ui_control", "page": "/orders/12", "ui_text": "Mark shipped"},
      {"kind": "network_request", "method": "PATCH", "path": "/api/orders/{id}/status",
       "json_paths": ["statusId"], "note": "statusId=40 after the click"}
    ]
  }]
}
```

The shape matches `definitions.semanticFact` in
`miniCRM/benchmark/schemas/reconstruction-output.schema.json`: `id` and `meaning` are required,
`additionalProperties: false`, and evidence lives **inside** the fact.

For a human reader, the prose description still lives in the final documentation. The primary
score is computed from the facts.

The price for this is that the evaluator does not recognize synonyms outside the public alias
table. This is a deliberate constraint, declared up front
([`04`](04-benchmark-contract.md) §4).

> **`id` is not the matching key.** The agent doesn't know ground truth's identifiers and assigns
> its own. The evaluator matches by canonical key (`kind` + `subject` + `value`); `id` is only
> used for references within the same document.

---

## 3. Primary metric: VARS

**VARS — Verified API Reconstruction Score.** Working name. Aggregates fact correctness with
weights reflecting user value. Only verifiable matches between `schema ↔ ground truth` are scored.

```
VARS = 100 × Σ (weight_category × F1_category)
```

### Proposed weights

Categories correspond to the sections of the output schema — matching uses the same units listed
in [`04`](04-benchmark-contract.md) §3.

| Category | Matching unit | Weight | Rationale |
| --- | --- | ---: | --- |
| Operations and paths | method + normalized path | 0.25 | Without an operations list, nothing else has anywhere to attach |
| Parameters and schemas | operation + location + name + type + required | 0.20 | Without this you can't call the operation |
| Semantic facts | `kind` + `subject` + `value` | 0.25 | The core value: what a HAR file doesn't give you |
| Dependencies and rules | `dependencies` + `business_constraint` | 0.15 | The hidden links that break integrations |
| Workflows | sequence of steps | 0.15 | Whole user scenarios |

> ⚠️ **Weights are not approved.** They need to be fixed **before** the first scored run and never
> changed afterward — otherwise there's a temptation to fit the metric to the result. ADR-2 in
> [`11`](11-decisions-and-open-questions.md).
>
> Open question: the "Semantic facts" category lumps together different `kind` values with very
> different user value (`enum_mapping` matters more than `identifier_meaning`). A version with
> sub-weights inside the category is being considered — but only if it doesn't make the metric
> opaque to a judge.

### What F1 means here

For each category, the evaluator compares the set of predicted atomic facts with the set of ground
truth facts by canonical key:

- **TP** — a predicted fact matches a ground truth fact
- **FP** — a predicted fact that isn't in ground truth (spurious)
- **FN** — a ground truth fact that wasn't predicted (missing)

`precision = TP / (TP + FP)`, `recall = TP / (TP + FN)`, `F1 = 2PR / (P + R)`.

Facts that fail schema validation, or are submitted with an empty or invalid `evidence` block, go
into `invalid` and **do not count as TP**, but are counted in the precision denominator.

---

## 4. Secondary metrics

| Metric | Definition | Why |
| --- | --- | --- |
| **Hallucination rate** | FP claims / all predicted claims | The cost of extra plausible-sounding claims — the main risk to the user |
| **Evidence support rate** | facts and claims with a non-empty, valid `evidence` block / all submitted | Provenance discipline; required by ground rule 09 |
| **Coverage** | discovered ground-truth operation groups / total | Helps interpret VARS: low VARS from narrow exploration ≠ low VARS from errors |
| **Wall time** | per case, median + p90 | Operational practicality |
| **Cost** | per case, median + p90 | Required by the brief's table |
| **Tool actions** | per case, median + p90 | Exploration efficiency |
| **Valid submission rate** | runs with a valid `submit_reconstruction` / total | Basic reliability; a case with no valid submission scores 0 |

---

## 5. Mandatory brief table

Filled in **only** from the experiment ledger, after actual runs.

| METRIC | SIMPLE BASELINE | AGENT SOLUTION | CHANGE |
| --- | --- | --- | --- |
| Primary outcome (VARS) | _not filled in_ | _not filled in_ | — |
| Human time per task | _not filled in_ | _not filled in_ | — |
| Cost per task | _not filled in_ | _not filled in_ | — |

**On "Human time per task."** Our task is automatic, so human time is measured as the time a
qualified engineer needs to reach a comparable result manually. The measurement method needs to be
fixed before submission (OQ-5): either time one case manually and extrapolate, or an honest "not
measured" — the latter is better than a made-up number.

---

## 6. Three levels of quality

Different things are judged in different ways. Mixing them up is a common mistake.

| Level | How it's evaluated | What it's for |
| --- | --- | --- |
| **Primary quantitative** | Deterministic fact-level evaluator | Fair comparison of baseline and AAE |
| **Qualitative product quality** | Human review of the finished OpenAPI/docs/workflows | End to End Quality criterion (20 points) |
| **Evidence quality** | Share of supported claims, provenance validity | Checks that the agent isn't dressing up guesses as facts |

The second level is judged by a **human**, and it's what judges evaluate too. The artifact must
look like something "a person would sign off on," not an obvious AI draft — the rubric's own
wording.

---

## 7. Evaluator algorithm

Five steps. None of them uses an LLM, embeddings, or fuzzy semantic matching.

| Step | Action | Result |
| --- | --- | --- |
| 1. **Validate** | JSON Schema, types, required keys, validity of nested `evidence` objects | Invalid output doesn't score; the reason is recorded |
| 2. **Normalize** | Methods, paths, identifiers, whitespace, canonical labels — per the defined rules | Comparable keys with no linguistic interpretation |
| 3. **Match** | Each prediction is matched against a ground-truth fact by type and canonical key | TP / FP / FN per category |
| 4. **Score** | precision, recall, F1 per category; hallucination rate; VARS | Final metrics + per-case breakdown |
| 5. **Audit** | Check completeness and validity of `evidence` blocks; produce `diff.json` and the report | Judge and developer can see exactly what was credited |

### Evaluator golden tests

The evaluator itself must be verified. Mandatory minimum:

- a valid exact match → TP;
- a missing fact → FN, doesn't affect precision;
- an extra fact → FP, lowers precision;
- a fact with no `evidence` block, or `evidence[].kind` outside the allowed list → `invalid`, not TP;
- a canonical-label mismatch (`sent` instead of `shipped`) → not TP;
- an invalid schema → a zero case score with the reason recorded;
- `miniCRM/benchmark/examples/perfect-reconstruction.json` → VARS = 100.

The last test is the most important: it proves 100 is achievable and the metric isn't broken.
`miniCRM/benchmark/examples/perfect-reconstruction.json` contains all 71 ground-truth facts with
the same `kind` values, so matching by `kind + subject + value` must give zero FP and zero FN. A
discrepancy here means the evaluator is broken or the benchmark artifacts have drifted.

---

## 8. Reporting without invented results

**Baseline → final numbers only appear after real runs.** Until then, targets and templates are
fine, but not "51% → 86%" presented as an achieved result.

The final table includes:

- all cases, no cherry-picking;
- the seed for each run;
- mean and spread;
- the full diff;
- an analysis of the one primary hard case with its failure mode.

This is simultaneously ground rule 09 ("Connect every claim about your results to the evidence you
submit") and a condition of the Measured Improvement criterion.
