# 05. Evaluation and metrics

> **Status:** draft (evaluator not implemented; weights need approval — ADR-2)
> **Updated:** 2026-08-30
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

> The constraint is only fair where `value` is a token the agent can observe. Eighteen facts once
> carried author-coined shorthand that appears nowhere in the traffic (`name-or-email`,
> `non-archived`, `integer-cents`, …); those became objects built from a closed vocabulary declared
> in the schema (ADR-14). The rule now: **a scalar `value` is a token that literally appears in
> traffic or the UI; anything else is an object whose keys the schema declares.** Of 71 facts, 22
> are still string-valued and all 22 are observable tokens.

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

### Weights — frozen 2026-08-30 (ADR-13)

Categories correspond to the sections of the output schema — matching uses the same units listed
in [`04`](04-benchmark-contract.md) §3.

| Category | Matching unit | Weight | Rationale |
| --- | --- | ---: | --- |
| Operations and paths | method + normalized path | 0.15 | A proxy capture already gives you this |
| Parameters and schemas | operation + location + name + type + required | 0.15 | Necessary, but also recoverable from a capture |
| Semantic facts | `kind` + `subject` + `value` | 0.35 | The core value: what a HAR file doesn't give you |
| Dependencies and rules | `dependencies` + `business_constraint` | 0.20 | The hidden links that break integrations |
| Workflows | sequence of steps | 0.15 | Whole user scenarios |

> **Frozen before any scored run** (ADR-13, 2026-08-30) and not revisited afterward. Sub-weights
> inside `semantic_facts` were considered and rejected: nine `kind` values with individual weights
> read as tuning and add no signal, since fact counts already weight the category implicitly.
>
> Two obligations come with the weights. **The per-category F1 vector is published next to every
> VARS figure**, so a reader can recompute the aggregate under their own weights. And **every
> comparison is also computed under the two rejected weightings** — the original 0.25 / 0.20 / 0.25
> / 0.15 / 0.15 and a flat 0.20 × 5. If the baseline↔AAE ranking holds under all three, the
> conclusion does not depend on the weights at all; if it doesn't hold, that is reported.

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
| **Cost** | per case, median + p90. USD = OpenRouter list prices from `GET /api/v1/models` (prompt + completion per token) × native token counts from the run (`tooling/llm/client.ts`). Not the billed generation record. | Required by the brief's table |
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

A fourth level — an LLM judge scoring semantic agreement where the deterministic matcher is blind —
is under consideration as a **separate column next to VARS, never mixed into it** (OQ-9). Blending
it would break Reproducibility: a judge must be able to re-run the evaluation and get the same
number.

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

The last test is the most important: it proves the metric isn't broken.
`miniCRM/benchmark/examples/perfect-reconstruction.json` contains all 71 ground-truth facts with
the same `kind` values, so matching by `kind + subject + value` must give zero FP and zero FN. A
discrepancy here means the evaluator is broken or the benchmark artifacts have drifted.

> **What this test does not prove.** The reference was written by the same author as ground truth,
> with the same vocabulary. Passing it shows 100 is reachable *by us*; it says nothing about whether
> 100 is reachable by an agent that never saw our wording. That is exactly the gap OQ-10 measures.

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
