# 04. Public benchmark contract

> **Status:** active (cases and schema exist; runner and evaluator do not)
> **Updated:** 2026-08-29
> **Source of truth:** `miniCRM/benchmark/cases.json`, `miniCRM/benchmark/schemas/reconstruction-output.schema.json`, `miniCRM/benchmark/README.md`
> **Maps to criteria:** Reproducibility (15), Measured Improvement (15)

---

## 1. What's public and what isn't

This split is the heart of the benchmark's fairness.

| Public (can be shown to judges and placed in the agent's context if needed) | Authors and evaluator only |
| --- | --- |
| Output schema `reconstruction-output.schema.json` | `miniCRM/benchmark/ground-truth/*.json` |
| List of allowed tools | `miniCRM/benchmark/INVENTORY.md`, `miniCRM/benchmark/GAPS.md` |
| Budgets (actions, time, tokens) | Source code `miniCRM/apps/api`, `miniCRM/apps/web`, `miniCRM/db/` |
| Normalization rules and canonical labels | Tests and seed |
| Case identifiers and descriptions | `ground_truth_fact_ids` inside cases |
| — | `docs/` as a whole: author-only |

**Rule:** the target's code and ground truth never enter the agent's tool context. Otherwise the
benchmark would measure a leak, not exploration. The runner only has access to them for reset and
scoring.

### Mechanical safeguard (must be implemented)

Discipline alone isn't enough — we need a barrier that can't be broken by carelessness:

1. The harness exports a **fixed** list of seven tools. None of them reads files.
2. The agent process runs with a working directory **outside** the target repo.
3. Before each run, the runner checks that the assembled agent context contains no strings from
   `miniCRM/benchmark/ground-truth/` (checked via hashes of known values).
4. The whole `miniCRM/` directory and the `docs/` directory are listed in the run configuration's
   deny-list.

---

## 2. Case set

**Current state: 15 cases** in `miniCRM/benchmark/cases.json`. The brief asks for "ten or more" —
the requirement is met with margin.

| ID | Difficulty | Challenging | Facts |
| --- | --- | :---: | ---: |
| `case-01-auth-session-csrf` | basic | | 11 |
| `case-02-customer-list-search-pagination` | basic | | 6 |
| `case-03-customer-write-schema-version` | medium | | 6 |
| `case-04-country-region-dependent-select` | medium | | 8 |
| `case-05-order-status-numeric-enum` | medium | | 7 |
| `case-06-order-detail-two-requests` | basic | | 12 |
| `case-07-add-note-refresh-activity` | basic | | 6 |
| `case-08-status-transition-version` | medium | | 11 |
| `case-09-create-order-workflow` | hard | ✅ | 22 |
| `case-10-shipping-method-ids` | hard | ✅ | 10 |
| `case-11-tax-cents-by-region` | hard | ✅ | 8 |
| `case-12-out-of-stock-quote` | medium | | 4 |
| `case-13-customer-delete-safety` | medium | | 4 |
| `case-14-draft-order-delete` | medium | | 3 |
| `case-15-dashboard-summary-semantics` | medium | | 9 |

**A case only scores what's visible from the browser.** A fact that can't be reached by clicking
through the UI (for example, an error the frontend physically cannot trigger) stays in ground
truth but is excluded from the case's fact list — otherwise the score would measure guessing HTTP,
not exploration. The rule is ADR-8; the list of such facts is in `miniCRM/benchmark/GAPS.md`.

The brief requires **one** hard case with a write-up. We have three marked `challenging`. For the
submission we need to **designate one as primary** and analyze it in depth — the other two stay in
the general table. Candidate: `case-09-create-order-workflow` (22 facts, the full chain with an
opaque `quoteId`). Decision — OQ-4 in [`11`](11-decisions-and-open-questions.md).

### Tested capabilities

The `capabilities_tested` field in `miniCRM/benchmark/cases.json` uses a closed list of 16 values:

| # | Capability | # | Capability |
| ---: | --- | ---: | --- |
| 1 | endpoint discovery | 9 | one UI action causing several API calls |
| 2 | request schema reconstruction | 10 | multi-request workflow |
| 3 | response schema reconstruction | 11 | request dependency |
| 4 | path parameter inference | 12 | related entity lookup |
| 5 | query parameter inference | 13 | dependent selects or similar chained data loading |
| 6 | pagination | 14 | conditional API calls |
| 7 | filtering/search | 15 | business validation/error behavior |
| 8 | numeric or otherwise opaque enum semantics | 16 | destructive action safety |

The list is closed: a new case either uses an existing value, or extending the list is recorded as
a decision in [`11`](11-decisions-and-open-questions.md).

---

## 3. Output schema

`miniCRM/benchmark/schemas/reconstruction-output.schema.json` (JSON Schema draft-07).

Required sections: `schema_version`, `operations`, `semantic_facts`, `dependencies`, `workflows`,
`claims`.
Optional: `benchmark_name`, `reconstructed_at`, `notes`, `components`, `confidence`, `actions`.
`additionalProperties: false` — the schema can't be extended on the fly.

### Scoring units

| Section | Unit | Example |
| --- | --- | --- |
| `operations` | method + normalized path | `PATCH /api/orders/{id}/status` |
| `operations[].parameters` | operation + location + name + type + required | `query.status: integer` |
| `semantic_facts` | `kind` + `subject` + `value` | `enum_mapping / order.status_id / 40` |
| `dependencies` | source → artifact → consumer | `POST /api/order-quotes → quoteId → POST /api/orders` |
| `workflows` | sequence of steps with roles | order creation |
| `claims` | statement + confidence + nested `evidence` | see [`08`](08-evidence-and-trajectories.md) |

### Evidence model

Evidence is **nested** inside a fact, operation, or claim rather than kept in a separate registry
with identifiers. `definitions.evidence` allows seven kinds:

`network_request`, `network_response`, `ui_label`, `ui_control`, `ui_action`, `cookie`, `header`.

Only `kind` is required; the rest (`page`, `method`, `path`, `status`, `json_paths`, `header`,
`cookie_name`, `ui_text`, `note`) are filled in where applicable.

**Citing source code is not allowed** — this is stated in the schema description ("Do not cite
source code") and structurally enforced by the `kind` list itself: all seven kinds are only
observable from the browser.

> Consequence: there are no cross-referencing `ev_NNN` identifiers in the schema, and checking
> referential integrity between a fact and a separate evidence store is impossible. Trajectory
> storage ([`08`](08-evidence-and-trajectories.md)) does use identifiers — that's a different
> level. Whether they should be linked is decided in OQ-8
> ([`11`](11-decisions-and-open-questions.md)).

### Kinds of semantic facts

`semantic_facts[].kind` is a closed list. Ground truth has 71 facts, distributed as:

| kind | Facts | What it records |
| --- | ---: | --- |
| `enum_mapping` | 15 | A numeric/string value ↔ its visible meaning |
| `business_constraint` | 13 | A condition → rejection (409/422) |
| `query_semantics` | 12 | What a query parameter does |
| `derived_value` | 10 | A server-computed value |
| `auth` | 5 | Session and CSRF mechanics |
| `validation` | 5 | Input validation rules |
| `identifier_meaning` | 5 | The meaning of an identifier |
| `state_transition` | 5 | Allowed transitions |
| `concurrency` | 1 | Optimistic locking |

> The nine `kind` values are a closed list, identical in ground truth and in the schema.
> Extending it requires a decision in [`11`](11-decisions-and-open-questions.md): each value is a
> separate matching category for the evaluator.

---

## 4. Canonical vocabulary and normalization

The evaluator doesn't understand meaning — it compares normalized keys. That's why the
normalization rules are public and the agent is aware of them:

1. **Paths** are normalized: concrete identifiers → `{id}`, `{customerId}`, `{addressId}`.
2. **Methods** are upper-case.
3. **Canonical labels** for enums: the exact label **visible in the UI**, converted to
   `lower_snake_case`.
4. **Aliases**, if needed, are declared up front in the public evaluation config.

**Hard boundary:** the evaluator does not accept `sent` as equivalent to `shipped` unless that
alias is in the public table. This is deliberate. The benchmark measures the ability to recover
**observed canonical facts**, not an LLM judge's taste.

> The list of allowed labels comes from ground truth and is published in the evaluation config
> **before** any runs. For order statuses this is `draft`, `confirmed`, `processing`, `shipped`,
> `cancelled` — exactly the labels drawn by `miniCRM/apps/web/src/orderStatus.ts`.

---

## 5. Fairness: what must match

A comparison is only meaningful under identical setup. Baseline and AAE receive identical:

- case set and seeds (the seed is set by the run configuration: `cases.json` has no `seed` field);
- target URL and target version (`application_commit`);
- role and credentials;
- tool surface (the same seven functions);
- output schema;
- action, wall-clock, and token budgets;
- model — when comparing the workflow rather than the model.

**Any deviation is recorded in the report with an explanation** (a direct brief requirement:
*"Explain any meaningful difference in the resources available to each one"*).

### Fairness checklist

- [ ] Public output schema and canonical vocabulary are identical for both systems
- [ ] Cases, seeds, target version, role, tools, and budgets match
- [ ] Ground truth and target source code are unavailable in the agent's context (mechanically checked)
- [ ] The evaluator is deterministic: no LLM, embeddings, or hidden fuzzy matching
- [ ] Cases ≥ 10; one primary hard case designated and analyzed
- [ ] The ledger records, per case: score, runtime, cost, seed, model version
- [ ] Any resource difference is explained
- [ ] The report contains no target or approximate figures in place of actual ones

---

## 6. Runner: run phases

The runner is neither an LLM nor an evaluator. It's the experiment dispatcher.

| Phase | What it does | What guarantee it provides |
| --- | --- | --- |
| **Reset** | Stops the API, brings MiniCRM up from a clean seed, starts the API, applies the run's role | Run independence and repeatability |
| **Launch** | Runs baseline or AAE with the same tool surface, versions, and budgets | Resource fairness |
| **Capture** | Saves the sequence of tool calls, observations, network activity, screenshots, final JSON | Trajectory and evidence are verifiable |
| **Evaluate** | Invokes the deterministic evaluator with the case's ground truth | The same rubric with no manual tuning |
| **Aggregate** | Records seed, model version, wall time, tokens, cost, results | A complete experiment ledger |

A run ends when `submit_reconstruction` is called **or** the budget is exhausted. Running out of
budget without a submission is a result (an invalid output), not a launch error.

---

## 7. Run artifact structure

```
artifacts/runs/<run-id>/
  meta.json           # case, seed, system, model version, target version, budgets
  trajectory.jsonl    # steps: instruction → tool call → response → observation → decision
  evidence/           # snapshots, request/response bodies, UI states
  reconstruction.json # what the agent submitted
  evaluation.json     # metrics
  diff.json           # matched / missing / spurious / invalid
  report.md           # human-readable write-up
```

`<run-id>` is formed as `<system>-<case>-<seed>`, e.g. `aae-case09-seed41`.
