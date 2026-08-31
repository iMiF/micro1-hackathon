# 04. Public benchmark contract

> **Status:** active (cases, schema, and evaluator exist)
> **Updated:** 2026-08-31
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
| `operations[].parameters` | operation + location + name + type | `query.status: integer` |
| `semantic_facts` | `kind` + `subject` + `value` | `enum_mapping / order.statusId / 40` |
| `dependencies` | source → artifact → consumer | `POST /api/order-quotes → quoteId → POST /api/orders` |
| `workflows` | ordered `(operation, role)` sequence, `refresh` steps dropped | order creation |
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

1. **Paths** are normalized: concrete identifiers *and the names of path parameters* are erased —
   `/api/customers/12/addresses`, `/api/customers/{id}/addresses` and
   `/api/customers/{customerId}/addresses` all reduce to `/api/customers/{}/addresses`.
   The name has to go because ground truth itself is not consistent about it: it has
   `GET /api/orders/{id}/activity` next to `GET /api/customers/{customerId}/addresses`, and an
   agent has no way to know which convention applies where. Verified against the live route source
   (`miniCRM/apps/api/src/routes/*.ts`): ground truth's naming is *accurate* — orders really are
   `:id` even nested, customers really are `:customerId`/`:addressId` — this is a genuine
   inconsistency in the target app, not a ground-truth authoring slip, and not something worth
   "fixing" by renaming routes in ground truth, since that would make it stop matching the real
   app. A name-sensitive key would cost points for an operation that was correctly discovered, and
   would drag its parameters down with it — confirmed on the first baseline run, not hypothetical:
   order response bodies (`OrderActivity`, `OrderNote`) literally contain a field named `orderId`,
   which leads a careful agent that reuses observed field names to write `{orderId}` for a path
   ground truth calls `{id}` — the opposite of a careless guess. The implementation both the
   agent-side serializer and the evaluator must use is `tooling/browser/paths.ts` (`normalizePath`,
   `operationKey`) — two implementations of this rule will disagree. **They did, from
   2026-08-30 22:39 UTC (when this rule was written) until 2026-08-30 (fixed): `evaluator/src/
   normalize.mjs` kept its earlier exact-name behavior and was never updated to match. See
   `evaluator/README.md` "Known interpretation calls" for the historical note.**
2. **Methods** are upper-case.
3. **Canonical labels** for enums: the exact label **visible in the UI**, converted to
   `lower_snake_case`.
4. **Aliases**, if needed, are declared up front in the public evaluation config.
5. **`semantic_facts[].value`** is either a token that literally appears in traffic or the UI, or an
   object whose keys come from `definitions.semanticFactValue` in the output schema — a closed,
   published list (ADR-14). No key or vocabulary word in the matching key has to be invented.
6. **Field references in `dependencies`** use declared prefixes: `header:`, `cookie:`,
   `Set-Cookie:`, `query.` for query-string parameters, and JSONPath (`$.field`) for body fields.
   `query.` was missing from this list until 2026-08-30 even though docs/04 §3 already uses the
   same notation for `operations[].parameters` (`query.status: integer`) -- a documentation gap,
   not a ground-truth error: `dep-country-to-regions` is generated from the live route
   (`request.query.country` in `miniCRM/apps/api/src/routes/geo.ts`), it just was never added to
   this list or to the agent-facing prompt. A bare `{param}` value (no prefix) is also allowed, and
   is normalized the same way as path-parameter names in rule 1 below -- same reasoning, same fix.
7. **JSONPath array indexes in dependency field references are wildcarded (ADR-16).** `$[].id`,
   `$.id`, `$[*].id`, `$.items[0].productId` and `$.items[*].productId` all reduce to the same
   form (`$.id` / `$.items[].productId`). An agent that copies a concrete index from one captured
   body, or writes standard JSONPath `[*]`, or copies ground truth's `$[]`, is describing the same
   field. Source and target *operations* stay exact — this is not a license to match the wrong
   edge. `*` as a target operation is **not** unified with a concrete endpoint: naming one consumer
   is a weaker claim than "all subsequent matching requests."
8. **Query-parameter subjects** for `semantic_facts` canonicalize to `METHOD /normalizedPath?param`
   (ADR-16). `GET /api/customers q`, `GET /api/customers query.archived`, and
   `GET /api/customers?archived` are one key; `GET /api/customers/suggest` is not rewritten, because
   `suggest` is a path segment, not a trailing query name. Inside `value.accepts`, the strings
   `"true"` / `"false"` coerce to booleans — query strings on the wire are strings, JSON bodies
   and ground truth use booleans, and that distinction is not observable as a different fact.
9. **Parameter `required` is not part of the matching key (ADR-16).** The unit is operation +
   location + name + type. A UI that always sends `page` / `pageSize` / `q` makes those parameters
   look required; ground truth marks them optional. The agent cannot recover the flag from the
   browser. Inventing a parameter that does not exist is still FP; omitting one that does is still
   FN. The field stays in the schema as documentation.
10. **Workflow `refresh` steps are dropped from the matching key; role `auth` is scored as
    `required_business` (ADR-16).** Post-success GETs are what the page does after the user goal,
    not a second goal. The schema offers `auth` as a role; ground truth records login as
    `required_business` — those are the same grammatical slot, not two facts. The remaining
    ordered `(operation, role)` sequence must still match exactly. Subsequence matching is
    rejected: one mega-workflow of the whole session would then collect every one-step ground-truth
    workflow. Combining two user goals, or writing three PATCH status calls as one lifecycle,
    remains FN.

**Hard boundary:** the evaluator does not accept `sent` as equivalent to `shipped` unless that
alias is in the public table. This is deliberate. The benchmark measures the ability to recover
**observed canonical facts**, not an LLM judge's taste. Structural normal forms (rules 1, 7–10)
are the same class as erasing `{id}` vs `{customerId}`: they unify notation a careful observer
could produce from one capture, they do not unify different claims.

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
- output schema and canonical vocabulary;
- **task prompt** — start URL, goal, output contract, epistemic rules, budgets (ADR-11);
- action, wall-clock, and token budgets;
- model — when comparing the workflow rather than the model.

**Any deviation is recorded in the report with an explanation** (a direct brief requirement:
*"Explain any meaningful difference in the resources available to each one"*).

### 5.1 Run configuration and the shared task prompt

The list above says these must be identical. This section says where they live, so that
"identical" is a property of the files rather than of anyone's memory.

| File | Holds | Read by |
| --- | --- | --- |
| `config/run.default.json` | target URL, credentials and role, budgets, policy profile, model, temperature, per-call output ceiling (`model.maxTokens`) | both agents, the harness, the runner |
| `config/task-prompt.md` | the task prompt: start URL, goal, output contract, epistemic rules, credentials, budget | both agents |
| `config/run.local.json` | optional gitignored overlay; environment variables `MINICRM_URL`, `AAE_EMAIL`, `AAE_PASSWORD` override both | — |

Both agents render the one task-prompt file through `tooling/config/run.ts`, which is the
mechanism ADR-11 needs: the task statement cannot silently diverge between the two systems,
because there is only one of it. Neither agent may edit, wrap, or prepend to it. Each agent's own
system and scaffolding prompts stay in its own directory and are expected to differ — that
difference is the result being measured.

**Credentials.** They reach the agent as part of the task prompt (ADR-15), never as a special
tool. MiniCRM's seeded demo credentials are committed on purpose: the target is fully synthetic
(`miniCRM/apps/api/src/seed.ts`) and a judge has to be able to reproduce a run. For any target
that is not this sandbox, use `config/run.local.json` or the environment variables, and commit
neither. Credentials are redacted out of run artifacts by `tooling/browser/network.ts` and are
excluded from the ledger entry — the presence of an auth header is an observation, the token is
not.

A run configuration that is missing a value fails at load, and a task prompt that would render an
empty credential throws rather than telling the agent to sign in as nobody.

---

### Fairness checklist

- [ ] Public output schema and canonical vocabulary are identical for both systems
- [ ] Cases, seeds, target version, role, tools, and budgets match — all from `config/run.default.json` (§5.1)
- [ ] The task prompt is identical; scaffolding prompts differ by design and both are published (ADR-11)
- [ ] The baseline prompt is the honest minimal version, not a weakened one — the ADR-11 test applies
- [ ] Neither system uses a shared component that interprets meaning; the shared layer is deterministic (ADR-12)
- [ ] Submission recovery and salvage are the shared `tooling/` path, identical for both systems (ADR-17)
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
| **Aggregate** | Records seed, model version, wall time, tokens, cost, results. Cost is an OpenRouter list-price estimate (`GET /api/v1/models` × native tokens), identical for both systems because both go through `tooling/llm/client.ts`. | A complete experiment ledger |

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
