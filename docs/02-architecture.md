# 02. Solution architecture

> **Status:** active — harness, baseline and AAE iteration 1 are implemented and scored; the Verifier and the Artifact generator are not built
> **Updated:** 2026-08-31
> **Source of truth:** design decision; actual state — [`09`](09-status-and-roadmap.md)
> **Maps to criteria:** Agent Solution & Engineering (30), End to End Quality (20)

---

## 1. Overall diagram

```
┌────────────────────┐
│ Operator / scope   │  staging URL + credentials, budgets, risk policy
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐        decision on the next step        ┌──────────────┐
│ AAE orchestrator   │ ◄────────────────────────────────────► │     LLM      │
│ memory, policy,    │        tool call + structured answer    │ has no       │
│ experiment plan    │                                         │ network      │
└─────────┬──────────┘                                         │ access       │
          │ tool call                                          └──────────────┘
          ▼
┌────────────────────┐        UI + network        ┌──────────────────────────┐
│ Browser harness    │ ──────────────────────► │ MiniCRM (target)         │
│ Playwright+Chromium│ ◄────────────────────── │ UI → XHR/fetch → REST API│
│ DOM, HAR, snapshots│      observations          │ permitted env only       │
└─────────┬──────────┘                          └──────────────────────────┘
          │ evidence
          ▼
┌────────────────────┐   claims + evidence    ┌──────────────────────────┐
│ Evidence store     │ ─────────────────────► │ Verifier                 │
│ events, snapshots,  │                        │ claim ↔ evidence         │
│ req/resp refs       │                        │ confidence / conflicts   │
└────────────────────┘                        └────────────┬─────────────┘
                                                            │ verified facts
                                                            ▼
                                              ┌──────────────────────────┐
                                              │ Artifact generator       │
                                              │ OpenAPI, docs, workflows,│
                                              │ confidence report        │
                                              └──────────────────────────┘
```

> **What of this diagram exists as of 2026-08-31.** Everything on the path from the operator to the
> evidence store is built and has been run: the harness, both agents, the evidence store. The
> **Verifier** and the **Artifact generator** are not written — `verifier.enabled` is `false` in
> `config/run.default.json`, and reconstruction JSON is not yet rendered into OpenAPI or prose.
> Verification in the shipped system is the weaker, deterministic form described in §4: a claim's
> `support` level, not a separate verifying role. Component status table: [`09`](09-status-and-roadmap.md) §2.

**Main architectural principle: the decision is separated from the action.** The LLM has no
direct access to `localhost` or the network. A local runner drives Chromium via Playwright,
executes tool calls, gathers observations, and only passes the model the permitted context.

Three consequences:

1. Everything the agent "knows" went through the harness and, therefore, is recorded as evidence.
2. Risk policy is applied inside the harness — before an action runs, not in the prompt.
3. Leaking ground truth into the context is physically impossible if the harness never hands it out.

---

## 2. Observation contract

What the harness passes to the agent at every step:

| Layer | What's passed | Why |
| --- | --- | --- |
| **Page** | URL, visible text, available elements with identifiers, form state | Understand what a user action does |
| **Network** | Method, normalized path, status, request/response body, timing, correlation id | Reconstruct the operation, parameters, and schemas |
| **Transition** | Which action happened before/after the request; UI state diff | Infer the effect and tie the enum to visible semantics |
| **Memory** | Confirmed claims, uncertainties, coverage, open hypotheses | Avoid re-discovering the known; plan the highest-value experiment |

The "Memory" layer is available **only to the final agent** — this is one of the differences from
the baseline.

### Tools visible to the agent

Identical for baseline and AAE (fairness requirement):

```
observe_page()                      → page + available elements
click(element_id)
fill(element_id, value)
select(element_id, value)
go_back()
get_network_events()                → normalized network events with correlation id
submit_reconstruction(reconstruction)  → structured output, ends the run
```

`submit_reconstruction` takes a **structured argument**, not Markdown. This rules out a situation
where the model prints prose instead of a result and the run can't be scored.

The harness method itself does no thinking: it stores the document, marks the run finished, and
returns `{ok, accepted}`. It exists as a tool rather than a final message so that "the agent is
done" is machine-readable and distinguishable from "the budget ran out" ([`04`](04-benchmark-contract.md) §6),
and so the submission lands in the run artifact next to the trajectory. Its one hazard is that the
entire document — roughly 26k characters for a full MiniCRM reconstruction — leaves the model as a
single argument; recovering one that was truncated or emitted in the wrong channel is the shared,
deterministic job of `tooling/reconstruction/recover.ts` (ADR-17).

---

## 3. Baseline: general-purpose browser agent

The baseline is not "a single 'go explore the app' prompt." It's a single general-purpose LLM
agent with the same browser tools, the same target, and the same output contract. It matches the
brief's "One general purpose agent with basic tools" option.

```
SYSTEM / task
You are given access to an undocumented web application. Explore it with the provided browser
tools and reconstruct as much of its HTTP API as possible.

You may inspect UI context and network events. You do not have source code, database access,
API documentation or ground truth. Do not invent information. When finished, call
submit_reconstruction(reconstruction).

TOOLS
observe_page() | click(element_id) | fill(element_id, value) | select(element_id, value)
go_back() | get_network_events() | submit_reconstruction(reconstruction)
```

**Baseline loop:** observe → form a hypothesis → test with a safe action → check against evidence
→ record what's confirmed. On uncertainty or conflict — run the next experiment.

**What the baseline lacks** (and this is exactly what AAE adds):

- explicit planning by information gain and coverage;
- a persistent log of hypotheses and conflicts;
- mandatory re-verification of claims;
- a risk classifier and an action-policy compiler;
- a separate verifier and evidence-report generation.

### Prompt layers

The prompt above is the **task prompt** — start URL, goal, output contract, epistemic rules,
budgets. It is benchmark input and is byte-identical for baseline and AAE: two systems given
different task statements are solving different tasks, and the improvement number would mean
nothing.

Everything else — the planner, hypothesis, verifier and synthesis prompts, tool descriptions,
inter-step memory — is **scaffolding**, and it is the implementation being measured. AAE is
expected to have several such prompts; the baseline has one. That difference is the result, not a
handicap.

The baseline's system prompt is the *honest minimal* version: the strongest single prompt a
competent engineer would write in an hour without any architecture. It is not weakened to widen the
gap. ADR-11 in [`11`](11-decisions-and-open-questions.md) states the rule and the test for it.

Rationale for choosing this particular baseline —
[`06`](06-baseline-and-changelog.md) §1.

---

## 4. Components of the final agent

Every component exists because it eliminates a **named** failure mode. A component with no measured
effect is removed and logged in the changelog as a removed experiment (a brief requirement) — which
is exactly what happened to the coverage planner this section used to open with.

### 4.1 What shipped: the ADR-18 asymmetric ensemble

Iteration 1, implemented in `agents/aae/` and scored at VARS(frozen) 71.21 against the baseline's
49.85 ([`06`](06-baseline-and-changelog.md) §3). The organizing decision is asymmetry: the roles are
deliberately unequal, most of them are deterministic, and **the role that explores is not the role
that writes**.

| Component | Where | Kind | Failure mode it eliminates | Ablation |
| --- | --- | --- | --- | --- |
| **Explorer** | `agents/aae/explore.ts` | LLM, the shared seven tools | Nothing on its own — it is the baseline loop with `submit_reconstruction` intercepted. Removing its ability to submit is what frees it to explore without also having to account | `AAE_ABLATE=extractors` returns it to baseline behavior, submitting in its own voice |
| **TrafficMiner** | `agents/aae/miner.ts` | deterministic | Operations, parameters and status codes that are present in the recorded traffic and never make it into the document. No model call: this is a pass over `evidence.jsonl` | `AAE_ABLATE=miner` |
| **DomainSweeper** | `agents/aae/sweeper.ts` | deterministic | Whole domains left unvisited because the Explorer found one section interesting; seeds coverage gaps from the observed route surface | `AAE_ABLATE=sweeper` |
| **Inquisitor** | `agents/aae/inquisitor.ts` | LLM, proposes only | A claim standing on a single observation is submitted as a fact. It never explores and never writes — it ranks under-refuted claims and proposes the experiment that would break one (ADR-19) | `AAE_ABLATE=inquisitor` |
| **Extractors** | `agents/aae/extract.ts`, `prompts/extract-*.md` | LLM, one per section, parallel | **The measured failure mode:** the agent sees everything and writes down a third of it. Each extractor reads the evidence with exactly one accounting job — operations, query parameters, enums, validation, dependencies, transitions, constraints, workflows | `AAE_ABLATE=extractors` |
| **Assembler** | `agents/aae/assemble.ts` | deterministic | A final free-form serialization step that truncates, reorders or reinvents. It merges the claim board by a fixed rule and calls `submit_reconstruction` itself — no model in the path | not ablatable; it is the submission path |

The roles **do not talk to each other.** They share two typed boards — a claim board and a gap board
(`agents/aae/boards.ts`, published per run as `claims.jsonl` and `gaps.jsonl`) — merged by a
deterministic rule. That is what makes each role's contribution separable at all, and it is the
concrete answer to OQ-6: multi-agent, but only because the ablation surface is the point.

**Not built:** the Verifier (`verifier.enabled: false`) and the Artifact generator. Verification in
the shipped system is the `support: observed | varied | refuted_attempt` level a claim carries
(ADR-19), not a separate role that re-checks claims against evidence.

**Not measured:** the ablations. The switches above are implemented and covered by
`npm run aae:selftest`, but no ablation run is scored, so each component's individual contribution is
argued from design rather than demonstrated. Recorded as such in [`09`](09-status-and-roadmap.md) §2
and [`06`](06-baseline-and-changelog.md) §3.

### 4.2 The pre-measurement design, kept for the record

This is the component set the project planned before the baseline had ever been run. It is preserved
because the gap between it and §4.1 is the most useful thing the first measurement produced.

| Component | Failure mode it eliminates | What actually happened |
| --- | --- | --- |
| **Coverage planner** | The agent gets stuck in one section, misses uncovered operations | **Removed before implementation.** The baseline scored `operations` F1 1.00 and `coverage` 1.00 — nothing left to recover |
| **Hypothesis ledger** | A hypothesis is lost between steps; a guess quietly becomes a "fact" | Shipped, in a stronger form: the claim board with an explicit `support` level (ADR-19) |
| **Experiment planner** | A single observation is treated as an enum value | Shipped as the Inquisitor, restricted to proposing refutations only |
| **Risk classifier** | The agent takes a destructive action in the name of exploration | Shipped in the harness, shared by both systems (`harness/policy.ts`), not an AAE component |
| **Verifier** | Plausible but unconfirmed claims in the output | Not built; `verifier.enabled: false` |
| **Artifact generator** | Formally correct JSON that's useless to a human | Not built. End to End Quality (20 points) is the criterion this leaves on the table |

> **The artifact generator doesn't affect the primary score.** It converts already-verified canonical
> JSON into OpenAPI and documentation. This is deliberate: prose quality is judged by a human, not by
> the deterministic evaluator.

---

## 5. Example of an active experiment

Illustrating the cycle with real MiniCRM mechanics:

1. **Observation.** On the order page, `PATCH /api/orders/12/status` is observed with body
   `{"statusId": 40, "version": 3}`, response 200.
2. **Hypothesis.** `statusId=40` corresponds to the state labeled "Shipped" in the UI. One
   observation isn't enough: the button's label was "Mark shipped," and the state label might
   differ.
3. **Experiment plan.** Find another order in the `Processing` state, click the same button,
   compare: the button label, the request body, and the state label after reloading the order
   card.
4. **Verification.** It matches on the second object → the claim gets
   `verification: {status: passed, rule: two_independent_observations}`.
5. **Recording.** `order.status_id:40 = shipped` lands in the verified output together with a
   nested `evidence` block (UI label + network observation). If the observations had diverged,
   the claim would have stayed unconfirmed and would not have made it into the verified output.

As a side effect of the same experiment: `version` turns out to be optimistic locking (a repeat
with the same `version` returns 409 `VERSION_CONFLICT`), and `Cancelled` is reachable from
`Processing` but not the other way around.

---

## 6. Documentation rule

> **Observed → confirmed.**

The system may produce a useful prose explanation, but a claim in production output must either
carry a facts/evidence reference or be explicitly flagged as `hypothesis` / `low confidence`.

The same rule governs this documentation itself — see [`README.md`](README.md) §Maintenance rules.

---

## 7. Component responsibility boundaries

To keep roles from blurring during development:

| Component | Responsible for | **Not** responsible for |
| --- | --- | --- |
| Runner | Resetting the target, launching the system, budgets, saving the trajectory, invoking the evaluator | Does not judge quality, does not make agent decisions |
| Harness | Executing tool calls, normalizing observations, applying risk policy | Does not plan, does not interpret |
| Agent (baseline / AAE) | Deciding the next step, producing the reconstruction | Has no access to ground truth or source code |
| Evaluator | Schema validation, normalization, fact matching, metrics | Uses no LLM, embeddings, or fuzzy matching |
| Artifact generator | Turning verified JSON into OpenAPI/docs | Does not add facts |

Violating any of these boundaries is a defect, not an optimization.

---

## 8. Repository layout

The tree mirrors §7: one directory per responsibility, and the boundary between "mechanics" and
"decisions" is visible in the file system rather than only in review comments (ADR-10).

```
micro1/
├── docs/                  project documentation (author-only, English)
├── miniCRM/               the target: apps/, db/, scripts/, tests/
│   └── benchmark/         ground truth, cases, schemas, reference reconstruction
├── agents/
│   ├── baseline/          self-contained; readable end to end by a judge
│   └── aae/               planning, hypothesis ledger, verification, synthesis
├── tooling/               browser driver, evidence capture, deterministic serialization
├── harness/               executes tool calls, normalizes observations, applies risk policy
├── evaluator/             schema validation, normalization, matching, VARS
├── runner/                Reset → Launch → Capture → Evaluate → Aggregate ([`04`](04-benchmark-contract.md) §6)
└── results/               trajectories, evidence, submissions, scores, the experiment ledger
```

`benchmark/` stays inside `miniCRM/` on purpose: ground truth is generated from the target's own
code by `miniCRM/benchmark/scripts/emit-ground-truth.mjs`, and separating them would let the two
drift. Everything that is *not* the target — agents, harness, evaluator, runner — lives outside it
(ADR-6).

**Two rules that keep this from eroding:**

1. `agents/baseline/` and `agents/aae/` never import each other. Shared code goes through
   `tooling/`.
2. `tooling/` executes and records; it never decides. Code that chooses the next action or
   classifies what an observation means belongs in `agents/aae/`, even when it looks like
   infrastructure — an adaptive retry policy is a strategy.

Duplication between the two agent loops is accepted as the price of a baseline a judge can read in
one sitting.
