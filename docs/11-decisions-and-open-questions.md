# 11. Decision log and open questions

> **Status:** active — updated as the project proceeds
> **Updated:** 2026-08-31

Two lists: accepted decisions (ADR) and open questions (OQ). A decision is never deleted or
rewritten — it gets a `superseded` status and a link to the new one. That way it stays visible why
the project is built the way it is, and not some other way.

---

## Accepted decisions

### ADR-1 — The source of truth for the target's behavior is the code, not the concept document

**Date:** 2026-08-29 · **Status:** accepted

**Context.** `Autonomous_API_Explorer_Technical_Documentation_RU.pdf` was written before
reconciliation with the implementation: it proposes a structure and mechanics rather than
describing an existing one. A line-by-line reconciliation of its claims against the code is in the
archive [`10`](10-source-review.md).

**Decision.** Hierarchy of sources: brief → code → `miniCRM/benchmark/ground-truth/` → `docs/` →
concept PDF (historical context only).

**Consequences.** Every claim about MiniCRM in the documentation is backed by a pointer to a
symbol in the code. `miniCRM/benchmark/ground-truth/` is regenerated from the code, never
hand-edited.

---

### ADR-2 — The primary metric is our own (VARS), but the brief's standard table is filled in too

**Date:** 2026-08-29 · **Status:** accepted · **Completed by:** ADR-13

**Context.** The brief asks for a single primary metric and allows proposing our own rubric. The
standard table (`Primary outcome`, `Human time per task`, `Cost per task`) poorly describes API
reconstruction quality, but can't be dropped.

**Decision.** VARS as the primary metric ([`05`](05-evaluation-and-metrics.md)) **plus** the
brief's standard table in full.

**Weights — ✅ settled by ADR-13 (2026-08-30), before any scored run.** The 0.25 / 0.20 / 0.25 /
0.15 / 0.15 proposal recorded here was superseded; sub-weights inside `semantic_facts` were
rejected.

---

### ADR-3 — Baseline: a general-purpose agent with the same tool surface

**Date:** 2026-08-29 · **Status:** accepted

**Context.** The brief allows four forms of baseline. A weak baseline yields a bigger improvement
number and weaker work.

**Decision.** "One general purpose agent with basic tools" — the same seven tools, the same
target, the same output schema, the same budgets. Only the internal organization differs.

**Consequences.** The claimed improvement will be smaller than with a weak baseline, but it will
reflect the workflow's actual contribution. Rationale —
[`06`](06-baseline-and-changelog.md) §1.

---

### ADR-4 — Reset order: stop the API → reset → start the API

**Date:** 2026-08-29 · **Status:** accepted

**Context.** `miniCRM/apps/api/src/session.ts` stores sessions in an in-process `Map`. `npm run
db:reset` clears the DB but not process memory: a session issued before the reset keeps working,
even though its user may no longer exist in the DB.

**Decision.** In the Reset phase, the runner stops the API process, performs the reset, then
starts the API again. A run never restarts the API internally.

**Consequences.** The Reset phase takes longer, but runs are genuinely independent.

---

### ADR-5 — Project documentation lives in the target repository, marked author-only

**Date:** 2026-08-29 · **Status:** ⛔ superseded by ADR-6

**Context.** The documentation describes the target's semantics. Placing it inside the target
repository is convenient: one shared history with the code.

**Decision.** `docs/` inside the target repository, author-only, on the run configuration's
deny-list.

---

### ADR-6 — Documentation moved to the project root, alongside the target

**Date:** 2026-08-29 · **Status:** accepted · **Supersedes:** ADR-5

**Context.** `miniCRM/` is the application under test. The agent that explores it, the harness, the
evaluator, and the runner are not the target and shouldn't live inside it. The documentation
describes all of them, not just the target, so it belongs one level up.

**Decision.** `docs/` lives at the project root next to `miniCRM/`. The author-only marking stays;
the run configuration's deny-list lists the whole `miniCRM/` directory plus `docs/`.

**Consequences.** Code references in the documentation are given from the project root
(`miniCRM/apps/api/src/domain/tax.ts`). Isolation no longer depends on whether the agent's working
directory matches the target repository: it's outside both
([`04`](04-benchmark-contract.md) §1).

---

### ADR-7 — Optimistic locking gets its own `kind` in the output schema

**Date:** 2026-08-29 · **Status:** accepted

**Context.** `semantic_facts[].kind` is a closed list of categories the evaluator matches facts by.
Optimistic locking (`version` + 409) isn't input validation — it's about reconciling concurrent
changes, and merging it into `validation` would erase the distinction the fact exists to capture.

**Decision.** `concurrency` is the ninth value of the `semanticFact.kind` enum. The same value in
the schema, in ground truth, and in the reference reconstruction.

**Consequences.** The `kind` list only grows through a decision recorded here: each value is a
separate matching key and a separate row in the metric breakdown.

---

### ADR-8 — A case only scores browser-observable facts

**Date:** 2026-08-29 · **Status:** accepted

**Context.** Part of the real API is unreachable from the UI: the client always sends a fresh
`version`, only draws the allowed status-transition buttons, always attaches the CSRF header,
creates a new quote on every order edit, and only shows deletion for a draft.

**Decision.** Such facts stay in `miniCRM/benchmark/ground-truth/semantics.json` — they're part of
the real API — but are excluded from cases' `ground_truth_fact_ids`. The list, with rationale per
fact, is in `miniCRM/benchmark/GAPS.md` §"Ground-truth facts that no case scores."

**Consequences.** A case's recall measures exploration, not HTTP guessing. If the target gains a UI
path to such behavior before the freeze, the fact returns to the case along with a regeneration of
the benchmark artifacts.

---

### ADR-9 — Project documentation is written in English

**Date:** 2026-08-30 · **Status:** accepted

**Context.** `docs/` was originally written in Russian (13 files, author-only). The user asked for
the whole set to be translated to English on 2026-08-30 to avoid mixing languages as the project
and its documentation grow.

**Decision.** All files in `docs/` are written in English going forward. Every file's metadata
block records this via `README.md` §"Language: English"; new files follow the same convention.

**Consequences.** The 2026-08-29 Russian originals are fully superseded — there is no bilingual
fork of `docs/`. Any new documentation file added to this directory is written in English from the
start; a file that drifts back into Russian is a defect, not a style choice.

---

### ADR-10 — Baseline and AAE are separate trees; shared code carries no decisions

**Date:** 2026-08-30 · **Status:** accepted · **Refines:** ADR-3

**Context.** ADR-3 fixed *what* the baseline is (a general-purpose agent with the same tool
surface). It did not fix *where the code lives*. Both systems need the same mechanics — a browser
driver, evidence capture, output serialization — and the tempting move is to factor everything
shared into one agent module with a strategy switch. That hides the baseline inside the final
agent's code, and a judge who wants to know what the baseline actually does has to reconstruct it
from branches.

**Decision.** Repository layout ([`02`](02-architecture.md) §8):

```
agents/baseline/   self-contained, readable end to end
agents/aae/        planning, hypotheses, verification, synthesis
tooling/           browser driver, evidence capture, deterministic serialization
harness/  evaluator/  runner/  results/
```

`agents/baseline/` and `agents/aae/` never import each other. Both import `tooling/`.

**Boundary rule.** `tooling/` contains mechanics only — code that executes an action or records a
fact, never code that decides *which action comes next* or *what an observation means*. If a piece
of `tooling/` starts choosing the next step or classifying an observation, it moves into
`agents/aae/`. Adaptive retry policies count as a decision.

**Consequences.** The baseline stays a box a judge can open. The cost is some duplication between
the two agents' loops; that duplication is intentional and is not refactored away.

---

### ADR-11 — The task prompt is shared; scaffolding prompts are the implementation

**Date:** 2026-08-30 · **Status:** accepted · **Refines:** ADR-3

**Context.** ADR-3 requires identical tools, schema, and budgets, but says only that "the internal
organization differs." Prompts sit across that line, and both extreme readings are wrong. If AAE
may not have its own prompts, it may not be an agent — planner, hypothesis, verifier, and synthesis
prompts *are* the engineering being measured. If the two systems get different task statements,
they are solving different tasks and the improvement number means nothing.

**Decision.** Prompts are split into two layers.

| Layer | Content | Shared? |
| --- | --- | --- |
| **Task prompt** | Start URL, goal, output contract, epistemic rules ("report only what you observed"), budgets | **Identical** — it is benchmark input, authored by the user, not the agent developer |
| **Scaffolding prompts** | System prompt, planner, hypothesis generation, verifier, synthesis, tool descriptions, inter-step memory | **Agent-specific** — this is the implementation |

The baseline's system prompt is the *honest minimal* version: the strongest single prompt a
competent engineer would write in an hour with no architecture — full tool descriptions, an
explicit instruction to explore thoroughly and not to invent. It is not weakened to widen the gap.

**Test for a fair baseline.** If the baseline loses because it has no memory of tested hypotheses
and revisits the same pages, that is a result. If it loses because nobody told it to look at error
codes, that is a defect in the baseline: fix it and re-run, do not publish it.

**Consequences.** Both systems' full prompts are published in the report. The claimed improvement
is attributable to scaffolding, which is what the Agent Solution & Engineering criterion asks for.
The ablation in [`06`](06-baseline-and-changelog.md) should include a middle point — baseline with
a stronger prompt but no architecture — so "is the gain from the architecture or from prompt
engineering?" has a measured answer rather than an assertion.

---

### ADR-12 — The agent serializes its own output; the shared layer is deterministic only

**Date:** 2026-08-30 · **Status:** accepted

**Context.** Turning observations into a submission has four layers: raw observation →
interpretation → stated claim → schema-conformant JSON. Layers two and three are exactly what VARS
measures and must never be shared. Layer four is mechanical. The question is where the cut goes.

One rejected option was to let agents emit free-form findings and have a shared component map them
into the schema. Such a component is necessarily an LLM, and it would perform interpretation: an
unmeasured participant in the comparison that lifts the weaker agent more than the stronger one,
and that makes "why did the baseline get `concurrency` right?" unanswerable.

**Decision.** Both agents emit schema-conformant JSON themselves. The output schema and the
canonical vocabulary of [`04`](04-benchmark-contract.md) §4 are part of the task contract and are
visible to both. The shared layer performs no semantic work: schema validation, identifier
assignment, whitespace normalization, de-duplication, and an equal number of retries when
validation fails. No LLM, no embeddings, no synonym guessing.

**On the `kind` enum as a hint.** Publishing the nine `kind` values gives both agents a vocabulary,
not an answer key: it does not say where in MiniCRM concurrency lives or on which entity. The
alternative — a smart normalizer — costs more than this leak.

**Consequences.** Choosing the wrong `kind` is a real error and scores as one, for both systems
equally. See OQ-10 for the part of the vocabulary that is not observable and therefore is not a
fair error.

---

### ADR-13 — VARS weights, frozen

**Date:** 2026-08-30 · **Status:** accepted · **Completes:** ADR-2

**Context.** ADR-2 left the weights open and required them to be fixed before the first scored run.
No run has happened yet, which is the only moment at which this choice can be made honestly. Three
candidates were considered: the original balanced proposal, an equal 0.20 × 5, and a
value-weighted split.

**Decision.**

| Category | Weight | Was |
| --- | ---: | ---: |
| Operations and paths | **0.15** | 0.25 |
| Parameters and schemas | **0.15** | 0.20 |
| Semantic facts | **0.35** | 0.25 |
| Dependencies and rules | **0.20** | 0.15 |
| Workflows | **0.15** | 0.15 |

**Rationale — the project's own thesis, stated before any result.** Routes and parameters are what
a proxy capture or a HAR file already yields; the product value this project claims is the part no
capture tool provides ([`01`](01-problem-and-value.md)). A metric that spends 0.45 on the part both
systems can do well also saturates in that half, compressing the very difference it exists to
measure.

**Sub-weights inside `semantic_facts`: rejected.** Nine `kind` values with individual weights are
opaque to a judge and easy to read as tuning. Frequency already weights implicitly — fifteen
`enum_mapping` facts against one `concurrency` fact. The per-`kind` breakdown goes in the report as
information, not as score.

**Two obligations that come with this decision:**

1. The per-category F1 vector is published next to every VARS figure, so any reader can recompute
   the aggregate under their own weights.
2. Every reported comparison is also computed under the two rejected weightings. If the
   baseline↔AAE ranking is stable across all three, the conclusion does not depend on the weights,
   and that sentence is worth more than the weights themselves. If it is not stable, that is
   reported too.

**Consequences.** The weights are frozen as of 2026-08-30 and are not revisited after the first
scored run, whatever it shows.

---

### ADR-14 — `semantic_facts[].value` uses a closed, published vocabulary

**Date:** 2026-08-30 · **Status:** accepted · **Closes:** OQ-10

**Context.** OQ-10 measured that about eighteen ground-truth facts carried author-coined shorthand
in `value` — `name-or-email`, `non-archived`, `integer-cents`, `csrf-exempt` — words that appear
nowhere in the traffic. Since the matching key is `kind` + `subject` + `value`, an agent could
understand the behaviour completely and still score FN + FP for not guessing our wording.

**Decision.** Every such value became an object whose keys come from a closed vocabulary declared in
`miniCRM/benchmark/schemas/reconstruction-output.schema.json` as `definitions.semanticFactValue`
(`additionalProperties: false`, with `rounding` and `effect` as enums). The rule the schema now
encodes:

> A scalar `value` must be a token that literally appears in traffic or the UI. Anything else is an
> object, and every key it uses is declared in the schema.

Examples: `name-or-email` → `{"matches": ["firstName", "lastName", "email"]}`; `csrf-exempt` →
`{"csrf": false}`; `decrement` → `{"field": "stockQty", "effect": "decrease"}`; the tax formula →
`{"base": ["subtotalCents", "shippingCents"], "factor": "rate", "rounding": "round"}`.

**Deviation from the OQ-10 sketch, stated plainly.** OQ-10 proposed nine value shapes, one per
`kind`. What was built is one closed vocabulary shared by all kinds. It is weaker — the schema does
not say which keys belong to which `kind` — and it was chosen for cost: it is a single definition
instead of nine conditional branches, on the last day before the deadline. The property that
matters is preserved: nothing in the matching key is a word the agent has to invent.

**This is still a hint, and that is the point.** There is no zero-hint option. Publishing the
vocabulary tells the agent what language to answer in, exactly as the `kind` enum does (ADR-12); it
does not say which endpoint has which values. The alternative — leaving coined slugs in place — does
not measure understanding, it measures telepathy.

**Verified by execution, not by reading** (the standing rule after ADR-7/ADR-8): ground truth
regenerated with `emit-ground-truth.mjs`, counts unchanged (71 facts, 22 dependencies, 18 workflows,
32 actions, 15 cases); `validate-ground-truth.mjs` passes; every ground-truth value validates
against `semanticFactValue`; `perfect-reconstruction.json` validates against the full schema and
still matches ground truth on `kind` + `subject` + `value` with 0 FP and 0 FN. String-valued facts
fell from 40 of 71 to 22, and all 22 are observable tokens (error codes, `sid`, `X-CSRF-Token`,
`paid` / `refunded`, `30d`).

**Residual, closed by ADR-16 (2026-08-31).** The leftover was not fuzzy matching: it was the same
class of problem ADR-14 named — two careful observers of one capture writing different strings for
the same field (`$[].id` vs `$.id` vs `$.items[0].productId`), plus author-coined *subjects*
(`auth.cookie`, bare `page`) that no amount of prefix documentation would have made guessable.
ADR-16 gives those strings a unique published normal form and rewrites the remaining coined
subjects onto the same grammar. The prefix convention in [`04`](04-benchmark-contract.md) §4 rule 6
stays; it was never enough on its own.

---

### ADR-15 — Credentials are given to both agents; the login pre-fill stays

**Date:** 2026-08-30 · **Status:** accepted · **Closes:** OQ-3

**Context.** `miniCRM/apps/web/src/pages/LoginPage.vue` pre-fills `admin@minicrm.local` /
`demo123`. OQ-3 asked whether this weakens the benchmark and whether credentials should instead be
passed through the run configuration.

**Decision.** Credentials are part of the task prompt, identical for both systems (ADR-11), and are
recorded in the run configuration alongside role and seed as [`04`](04-benchmark-contract.md) §5
already requires. The pre-fill in the target stays.

**Why giving credentials costs nothing.** The product framing has always been an operator handing
the tool a staging URL and credentials ([`02`](02-architecture.md) §1) — guessing a password is not
a capability anyone wants documented. And none of the facts `case-01-auth-session-csrf` scores
depends on it: `sem-session-cookie`, `sem-csrf-header`, `sem-csrf-exempt-login`,
`sem-invalid-credentials`, `sem-unauthenticated` and the three `dep-*` links are all recovered by
observing traffic around login. `sem-invalid-credentials` in fact requires the agent to send a
deliberately wrong password, which it can only do once it understands the field exists.

**Why the pre-fill stays.** Removing it is cheap — two lines, and `tests/e2e/smoke.spec.ts` fills
the fields itself, so nothing breaks. It simply buys nothing measurable: request parameters for
`POST /api/auth/login` are visible in the network events regardless of who typed them, and typing
into fields is exercised by every other case anyway. Login is also the gate to all fifteen cases,
so the cheaper that step is, the less of the benchmark a harness glitch can take down.

**Consequence — disclosure, not silence.** The report states in one line that the login form is
pre-filled, that this eases the sign-in step, and that no scored fact depends on it, with the
case-01 fact list as backing. A declared simplification reads as rigour; an undeclared one reads as
sloppiness.

**Rejected alternative, kept on the shelf.** The harness could clear the two fields after page load
— target untouched, identical for both systems, revertible in one line — if a reason ever appears to
require the agent to actually use the credentials it was given. It would have to be recorded as a
deviation under [`04`](04-benchmark-contract.md) §5.

---

### ADR-16 — Matching keys have a unique published normal form for observationally equivalent notation

**Date:** 2026-08-31 · **Status:** accepted · **Closes residual of:** ADR-14

**Context.** Scored baseline reconstructions (grok-4.6 `…T05-55-35-991Z`, gpt-5.6-sol
`…T05-43-17-477Z` / `…T06-13-01-592Z`, sonnet-5 `…T05-30-26-386Z`) recovered the right *edges and
sequences* and still scored FN+FP because the matching key demanded the author's spelling. Concrete
near-misses, verified from `diff.json`, not inferred:

- dependencies: `$[].id` (ground truth) vs `$.id` / `$.items[0].productId` / `$.items[*].productId`
  (the last is standard JSONPath; Sol wrote it and still lost);
- workflows: create-order submitted as ground truth's six steps plus the two GETs the UI actually
  fires after success — the extra `refresh` steps zeroed the whole workflow;
- parameters: `page` / `q` / `country` always sent by the UI, marked `required: true` by the agent
  and `required: false` by ground truth;
- semantic_facts: `GET /api/customers q` vs `GET /api/customers?q`; `"true"` vs `true` in `accepts`.

ADR-14 already named this "measuring telepathy." It closed coined *values*. The leftover was
notation that a careful observer of one capture can write several ways, and a handful of coined
*subjects* (`auth.cookie`, `mutating /api`, `order snapshots`, bare `page`).

Filling `canonical-vocabulary.json` aliases with those near-miss strings would be an answer key.
Prompting the 71 facts would be an answer key. An LLM judge mixed into VARS would break
Reproducibility. Subsequence matching of workflows would let one mega-workflow of the session
collect every one-step ground-truth row. Unifying `*` with a concrete CSRF consumer would credit a
weaker claim as the universal one.

**Decision.** A matching key may contain only (a) a token observable in traffic or the UI, (b) a
closed published vocabulary (`kind`, role enum, `semanticFactValue` keys), or (c) a structural
relation with **one** published normal form. If two careful agents, looking at the same capture,
can honestly write different strings, those strings reduce to one key. If they assert different
*content* (incomplete `to: [20]`, incomplete `matches`, CSRF on one route instead of `*`), that
stays FN/FP.

Four normalizers, all in `evaluator/src/normalize.mjs` / `match.mjs`, declared as
[`04`](04-benchmark-contract.md) §4 rules 7–10:

1. JSONPath array indexes collapse to `[]`; a root `$[]` / `$[*]` prefix collapses to `$.`.
2. Query-parameter subjects canonicalize to `METHOD /path?param`; `accepts` `"true"`/`"false"`
   coerce to booleans.
3. Parameter matching drops `required`.
4. Workflow matching drops `role: refresh` steps and maps `auth` → `required_business`.

Ground-truth subjects that were still author-coined and not a structural variant (`auth.cookie` →
`cookie:sid`, `auth.csrf` → `header:X-CSRF-Token`, `mutating /api` → `header:X-CSRF-Token` with the
error-code value, `order snapshots` → `order.customerNameSnapshot`, `page` / `pageSize` →
`query.page` / `query.pageSize`, `suggest` → `GET /api/customers/suggest` with value `10`) are
rewritten onto that grammar. Redundant `value.field` copies of the subject (`stockQty` on
`products.stockQty`) are dropped. `*Cents` and `ui.search` stay: the first is a published suffix
wildcard for every JSON field sharing that suffix; the second is a client-only timing fact with no
HTTP token, and `ui.` is a declared prefix for that case only. No per-fact aliases.

The agent-facing prompt gets the **grammar** of a key (how to write JSONPath, `*`, subjects,
one-goal workflows, always-sent ≠ required). It does not get the 71 facts.

**Weights are not revisited (ADR-13).** This is the same class of fix as erasing `{id}` vs
`{customerId}`: the unit does not change, only the normal form of the string inside it. Existing
`reconstruction.json` files are re-scored; the pre-ADR-16 VARS is kept in [`06`](06-baseline-and-changelog.md)
in parentheses.

**Rejected, with the reason kept.**

- Per-fact aliases of model phrasing (`mutating API routes` → `header:X-CSRF-Token`) — an answer
  key, and it would grow with every new wording.
- Workflow subsequence / "contains GT" — gameable by dumping the session as one workflow.
- `*` = a concrete target operation — over-credits a weaker claim.
- Subset matching of `value` objects — an empty object would match everything.
- Prompt-only dialect instructions — Sol already wrote correct `[*]` JSONPath and still lost;
  old runs could not be re-scored.

**Verified by execution.** Golden tests in `evaluator/tests/golden.test.mjs` lock each rule to a
near-miss taken from the scored diffs (not a synthetic that could only pass the new code).
`perfect-reconstruction.json` still scores VARS = 100 on all three weight vectors. Incomplete
content (`matches: ["firstName"]` vs the three-field ground truth; `to: [20]` vs `[20, 50]`; CSRF
to one PATCH vs `*`) still scores FP+FN.

**Consequences.** AAE iterations must win on facts the baseline did not *find* (error codes, tax
table, quote TTL), not on guessing `$[]`. The next baseline run uses the same grammar in the
prompt; the official scored number is the re-score of reconstructions already submitted, so the
prompt change is not mixed into that figure.

---

### ADR-17 — Submission recovery is shared, mechanical, and never returns empty-handed

**Date:** 2026-08-31 · **Status:** accepted · **Refines:** ADR-12

**Context.** The first `deepseek/deepseek-chat-v3.1` runs
(`results/runs/baseline-2026-08-31T00-32-52-219Z`, `…T01-32-22-527Z`) produced
`reconstruction.json` = `null` and `summary.json` `finished: false`: `submit_reconstruction` was
never called on the harness at all. The chain, established from the artifacts rather than guessed:
the tool argument arrived with no `reconstruction` key and nothing resembling the document, the
sibling text held no parseable JSON, so `reconstructionArg` returned `undefined` — and because
`rememberAttempt` fired only when recovery had *already* succeeded, `lastAttempt` stayed unset. Two
validation retries burned, the wall clock ended the run, and the end-of-loop net
(`lastAttempt !== undefined`) could not fire. The net could only ever catch the case where it was
not needed.

The same run refutes the obvious suspicion. Input volume was not the cause: that run summed 178 100
input tokens over ~46 calls (~4k average context) against 3 314 283 over 94 calls (~35k average) in
the Haiku run that succeeded. The pressure is on the **output** side — the whole document leaves the
model as a single tool argument, ~26k characters (~9k tokens) for a full MiniCRM reconstruction,
against a `max_tokens` that was hardcoded at 16 384 and never passed from the run configuration.

**Decision — three parts.**

1. **Recovery lives in `tooling/reconstruction/recover.ts`, not in an agent's tree.** Baseline and
   AAE must recover identically; an unequal recovery path silently favours whichever system has it,
   which is the same objection ADR-12 raises against a shared interpreter, only harder to see.
2. **A last-resort salvage runs once the loop is over and nothing was stored.** It repairs a JSON
   document cut off mid-generation — keep everything up to the last complete nested value, drop the
   partial one, close the containers still open — and then supplies `[]` for any required section
   the truncation removed. It is purely structural: no value is edited, no `kind` chosen, no fact
   invented. It cannot inflate a score, because an empty section yields no true positives and the
   facts it does not contain are counted as false negatives exactly as they would be had the run
   submitted nothing. What it changes is the floor: a truncated document scores what actually
   arrived instead of scoring zero as `invalid`.
3. **The per-call output ceiling is shared configuration.** `model.maxTokens` moves into
   `config/run.default.json` (32 000), is recorded in every run's ledger entry, and is therefore
   identical for both systems by construction — like every other budget (ADR-11).

**The ceiling has a second-order cost, paid here.** The Anthropic SDK refuses a *non-streaming*
request whose estimated duration exceeds ten minutes — it estimates 60 minutes at 128k output tokens
— unless the client carries an explicit timeout, so a 32k ceiling is rejected before it reaches the
network (`AnthropicError: Streaming is required…`). Lowering the ceiling back under ~21k would trade
away the headroom the document needs, so `tooling/llm/client.ts` sets the timeout the SDK would have
computed, using the SDK's own formula and derived from the shared `maxTokens` — identical for both
systems, no new configuration field. Verified by execution: the same request throws without the
timeout and reaches the network with it. Streaming is the more robust answer and is the follow-up if
a scored run ever approaches this bound; at ~9k tokens for a full document, Opus does not.

**Diagnostics, so the next failure is not guesswork.** Every `submit_reconstruction` call logs the
argument size, the nested document size, the sibling-text size, the argument keys, and the
response's `stop_reason`. An empty argument with `stop_reason=max_tokens` is a truncated generation;
an empty argument that stopped normally is a model that cannot fill a free-form `object` parameter.
The two need different fixes and are indistinguishable without the line.

**Verified by execution** (the standing rule since ADR-7/ADR-8). The real 26 266-character Haiku
submission was truncated at eleven points from 95% down to 3% and pushed through salvage plus the
validator: every one produced a schema-valid document containing exactly the items that survived the
cut, and a healthy submission passed through byte-identical. The 60% cut scores VARS(frozen) 22.18
under the deterministic evaluator where it previously scored 0. Both self-test suites are green,
with three new cases covering repair, the empty-section fill, and the nothing-to-recover path.

**Consequences.** A run can still end without a submission — if the model never called the tool, or
called it with nothing recoverable in either channel — and that is still a result, recorded as such.
What no longer happens is a run losing a document it demonstrably produced. The salvage path and the
`maxTokens` value are both reported alongside the comparison, since both are part of the setup the
two systems share.

### ADR-18 — AAE is an asymmetric ensemble, and its component list comes from the measurement

**Date:** 2026-08-31 · **Status:** accepted · **Implemented:** commit `5977bd1`, `agents/aae/`

**Context.** The pre-measurement component list ([`02`](02-architecture.md) §4.2) was written before
any run existed. The first scored baseline run contradicted it: `coverage` 1.00, `operations` F1
1.00, and `semantic_facts` recall 0.08. The agent explored completely and wrote down a third of what
it saw. A coverage planner — the first component on that list — had nothing left to recover.

**Decision.** Derive the component set from that measurement instead. Iteration 1 is an **asymmetric
ensemble**: an Explorer (LLM, the shared seven tools) whose `submit_reconstruction` is intercepted so
it never writes the document; deterministic TrafficMiner and DomainSweeper passes over recorded
evidence; an Inquisitor (LLM) that only proposes refutation experiments; per-section Extractors (LLM,
parallel) that each have exactly one accounting job; and a deterministic Assembler that merges the
claim board and calls `submit_reconstruction` itself. The roles never talk to each other — they share
two typed boards merged by a fixed rule. The coverage planner is **dropped before implementation**
and recorded as a removed experiment in [`06`](06-baseline-and-changelog.md) §3.

**Consequences.** Closes OQ-6 with a reason rather than a preference: the split exists because it
makes each contribution separately ablatable, not because more components look better. Every role is
individually switchable (`AAE_ABLATE`), which is the obligation the split takes on — an obligation
only partly discharged, since no ablation run was scored before the deadline. Measured effect of the
ensemble as a whole, on two models (ADR-22): VARS(frozen) **33.56 → 61.12** on `openai/gpt-5.6-luna`
(the published pair, matching `run.default.json`) and **49.85 → 71.21** on `openai/gpt-5.6-sol` (a
replication). Same sign, same categories: the movement is concentrated in synthesis, not coverage.

---

### ADR-19 — Curiosity is a data structure, not a trait of the model

**Date:** 2026-08-31 · **Status:** accepted · **Implemented:** `agents/aae/boards.ts`, `inquisitor.ts`

**Context.** "Have the agent be curious and verify its guesses" is a prompt instruction, and a prompt
instruction cannot be ablated, measured, or audited after the fact.

**Decision.** Every claim carries `support: observed | varied | refuted_attempt`. A claim of kind
`business_constraint`, `validation` or `derived_value` sitting at `observed` is by definition a
hypothesis, not a fact. The experiment queue is **computed** from the set of under-refuted claims —
rank = the claim's category weight (ADR-13) × the number of unresolved claims it would settle — not
produced by asking a model what it feels uncertain about. Missing knowledge is classified into four
kinds: already present in captured traffic (TrafficMiner), reachable by varying an input
(DomainSweeper), reachable only by deliberately violating a UI-enforced rule (Inquisitor), or
unreachable through the browser at all (OQ-13). Every experiment goes **through** the harness policy
gate like any other action. Rounds stop on diminishing returns, and the whole round sweep is
published rather than its best point.

**Consequences.** Curiosity becomes inspectable: `claims.jsonl` and `gaps.jsonl` ship with every run,
and a judge can see which hypotheses were raised, which were attacked, and which were left standing.
It also bounds the cost — the queue is finite and ranked, so "keep exploring until satisfied" is not
a thing the system can do.

---

### ADR-20 — Extended reasoning is model configuration, so it stays out of iteration 1

**Date:** 2026-08-31 · **Status:** accepted

**Context.** A thinking budget is tempting to switch on for AAE alone, and doing so would make the
architecture look better than it is.

**Decision.** Extended reasoning is configuration of the same class as `temperature` and `maxTokens`,
all of which the fairness contract declares identical for both systems (ADR-11, ADR-17). Iteration 1
therefore runs with reasoning **off everywhere** (`aae.reasoning.enabled: false`). When it is turned
on it is turned on for both systems together, in its own iteration, with a fourth control point
**B2** (B1 plus reasoning) so the architecture's contribution is `AAE − B2` rather than an assertion.
If only one control run is affordable, it is B2, not B1.

**Consequences.** Neither published delta (+27.57 on luna, +21.37 on the sol replication) can be
explained by one system having been allowed to think longer. Mechanical note for whoever runs
iteration 2: a thinking budget forbids `temperature ≠ 1`, so that iteration needs k repeats per point
rather than a single deterministic run.

---

### ADR-21 — `maxSteps` and `wallClockMs` are a shared contract; the `aae` block may only subdivide it

**Date:** 2026-08-31 · **Status:** accepted · **Enforced:** `tooling/config/run.ts`, `agents/aae/agent.ts`

**Context.** AAE has internal rounds and roles that each need a share of the step budget. The
tempting shape — "give the ensemble more steps, it has more to do" — silently converts an
architecture comparison into a budget comparison.

**Decision.** `budgets.maxSteps` and `budgets.wallClockMs` are the shared fairness contract, enforced
by the harness rather than by any prompt. The `aae` block in `config/run.default.json` may only
**subdivide** what `budgets` grants: `rounds.stepBudgetSplit` is asserted to sum to ≤ 1.0 at load
time and again before the run starts, and a violation refuses to start rather than warning. Raising
either budget for one system obliges a re-run of the other at the new value before any comparison is
published. `maxCostUsd` is exempt: it stops a run rather than shaping it.

**Consequences.** In the published luna pair both systems ran at the shipped `maxSteps` 200 and
`wallClockMs` 900000 and neither hit the ceiling (baseline 69 actions, AAE 137), so the comparison is
not a budget artifact in either direction. The sol replication used an overlay of 300 steps (baseline
127, AAE 264) — internally fair, not the default. The resource difference that does exist on luna —
2.5× wall time, 4.4× cost — is reported next to the score, as the brief requires.

---

### ADR-22 — The default model is `openai/gpt-5.6-luna`

**Date:** 2026-08-31 · **Status:** accepted · **Enforced:** `config/run.default.json` `model.id`

**Context.** ADR-11 requires both systems to share a model when the comparison is of workflows, not
of models. After iteration 1 was scored on `openai/gpt-5.6-sol` —

| | baseline `…T14-45-38-777Z` | AAE `…T14-51-18-382Z` |
| --- | ---: | ---: |
| VARS(frozen) | 49.85 | 71.21 (+21.37) |
| cost | $0.92 | $3.32 |

— the same architecture, same seven tools and same task prompt were scored on
`openai/gpt-5.6-luna`:

| | baseline `…T16-00-44-545Z` | AAE `…T16-04-43-124Z` |
| --- | ---: | ---: |
| VARS(frozen) | 33.56 | 61.12 (+27.57) |
| cost | $0.05 | $0.22 |

Luna is weaker in absolute terms on **both** systems (baseline −16.3, AAE −10.1). It is roughly
fifteen times cheaper for the pair ($0.27 vs $4.24). The architecture's delta does not depend on
which of the two was used: AAE is ahead under all three weight vectors on both, and the movement
sits in the same categories (`workflows`, `semantic_facts`, `dependencies`).

**Decision.** Pin `config/run.default.json` to `openai/gpt-5.6-luna`. The published pair is the luna
pair, which now matches the shipped default (`maxSteps` 200, `temperature` 0). The sol pair is
**kept as a replication**, not deleted and not silently retargeted: it is the evidence that the
+20-point-class gain is an architecture result, not a model result. Absolute scores are expected to
be lower than sol; the claim this project makes is the delta, not a model's ceiling.

What was not chosen: keeping sol as the default because it scores higher. That would have made
every Path B/C reproduction cost ~$4 and would have left `run.default.json` describing a model the
submission does not actually run. Luna is the model a judge will hit if they follow the
reproduction guide without an overlay.

**Consequences.** Headline numbers drop (33.56 → 61.12 rather than 49.85 → 71.21). The "model
deviation" note in [`06`](06-baseline-and-changelog.md) §3 and [`REPRODUCTION.md`](REPRODUCTION.md)
§6 comes out: default `model.id` and published pair now agree. The luna ledger records
`maxCostUsd` 10 from a leftover overlay; neither run spent more than $0.22, so the cap did not bind
(ADR-21 already exempts it). The sol pair stays in the changelog, labeled as a replication; it was
run at `maxSteps` 300 under a gitignored overlay and is therefore not a run of the shipped default
(ADR-21). A second luna AAE run at `maxSteps` 300 (`aae-2026-08-31T16-14-48-523Z`, VARS 62.35) is
not published — there is no matching luna baseline at that budget.

---

## Open questions

### OQ-1 — Actual deadline date — ✅ **resolved 2026-08-30**

**Answer.** The challenge runs **Aug 28 – Aug 31, 2026**, with the closing window
**11:00 AM – 2:00 PM, America/Toronto** on Aug 31. Source: the organizers' schedule, supplied by
the author.

**Consequence — the day-by-day plan in [`09`](09-status-and-roadmap.md) §4 was written for a
14-day runway that never existed.** As of 2026-08-30 there is roughly **one working day** left. The
D-5 scope-stop condition ([`09`](09-status-and-roadmap.md) §5) is therefore already in force,
retroactively: nothing is added to the agent until a deterministic evaluator and a working baseline
exist. Any open question whose fix costs more than an hour is now decided in favour of the cheap
option plus an honest disclosure in the report — see OQ-10.

---

### OQ-3 — Pre-filled login weakens the benchmark — ✅ **closed by ADR-15** (it does not; credentials are supplied to both agents and the pre-fill stays)

**Priority:** ~~medium~~ closed · **Affects:** `case-01-auth-session-csrf`

`miniCRM/apps/web/src/pages/LoginPage.vue` pre-fills `admin@minicrm.local` / `demo123`. This
doesn't violate ground rule 08 (the data is synthetic), but it simplifies auth discovery more than
intended: the agent doesn't need to figure anything out.

Options: (a) leave it and acknowledge it in the report; (b) remove the pre-fill and pass
credentials to the agent through the case configuration. Option (b) is cleaner, but it's a target
change — only possible **before** the freeze.

---

### OQ-4 — Which case to designate as the primary hard case

**Priority:** medium · **Deadline:** by D-3

The brief requires **one** hard case with an analysis of what it revealed. We have three marked
`challenging`: `case-09` (order-creation workflow, 22 facts), `case-10` (shipping-method
identifiers), `case-11` (tax by region).

Candidate: `case-09` — the longest dependency chain and an opaque `quoteId`. The other two stay in
the general table.

---

### OQ-5 — Method for measuring "Human time per task"

**Priority:** medium · **Deadline:** by D-3

The brief's table requires human time. Our task is automatic; there's no baseline for it.

Options: (a) time a qualified engineer's manual reconstruction of one case and extrapolate, with a
caveat; (b) an honest "not measured" with an explanation.

A made-up number is the worst option of all: it violates ground rule 09 and undermines trust in
every other number in the report.

---

### OQ-8 — Whether to link submission evidence to the run log

**Priority:** low · **Affects:** auditability, not score

Evidence exists at two levels ([`08`](08-evidence-and-trajectories.md) §2): nested objects inside
the submission (schema, no identifiers) and `ev_NNN` entries in run artifacts. There's no link
between them: given a fact from the submission, there's no mechanical way to find the trajectory
step that produced it.

Not needed for scoring — the evaluator only reads the submission. For human review and for the
Reproducibility criterion, a link would be useful.

Option: add an optional `trace_ref` field to `definitions.evidence`. Cost: a schema change;
benefit: a judge can mechanically walk the chain "claim → agent step."

Decide **after** the harness starts writing trajectories and it becomes clear how painful this is
to do by hand.

---

### OQ-6 — Is multi-agent orchestration needed — ✅ **closed by ADR-18** (yes, on the measured failure mode)

The brief states directly: *"Purposeful choices matter more than the number of components."* The
question was left open until the single-agent version's real failure mode became visible, and it did:
the baseline explored completely and transcribed a third of what it saw. Splitting the loop so that
the role which explores is not the role which writes is a direct response to that, and it moved
VARS(frozen) 33.56 → 61.12 on luna (published) and 49.85 → 71.21 on sol (replication), with the gain
concentrated in the synthesis categories on both.

**The condition set here is only partly met.** This question asked for an *ablation* to justify the
split, and no ablation run was scored before the deadline — the switches exist
(`AAE_ABLATE=miner,sweeper,inquisitor,extractors`, self-tested) but the runs do not. So the ensemble
as a whole is measured; its individual components are not. Recorded as an outstanding obligation in
[`06`](06-baseline-and-changelog.md) §3 and [`09`](09-status-and-roadmap.md) §2 rather than quietly
counted as satisfied.

---

### OQ-9 — Whether to add an LLM semantic-agreement layer as a second metric

**Priority:** medium · **Decide:** after the first scored runs · **Affects:** [`05`](05-evaluation-and-metrics.md) §6

The deterministic evaluator answers "did the agent recover the canonical fact?" It cannot answer
"did the agent understand the behavior?" If baseline and AAE both find all routes and parameters,
the deterministic score may not separate them on the axis that actually matters.

Option: a second layer that compares a ground-truth fact with the agent's claim using an LLM judge.

**Hard constraint if it is added: it is reported next to VARS and never mixed into it.**
Reproducibility (15 points) requires a judge to re-run the evaluation and get the same number; an
LLM judge drifts with model version. Two questions, two columns, and the second never rewrites the
first.

Minimum guarantees for such a layer: pinned model and version, temperature 0, the judge blind to
which system produced the claim, randomized pair order, the judge prompt published, and the judge
itself validated — `miniCRM/benchmark/examples/perfect-reconstruction.json` must score near 100 and
a deliberately degraded copy must score clearly lower, with agreement across *k* repeats reported
as the judge's own reliability.

Note the ordering with OQ-10: the LLM layer is most valuable exactly where the deterministic one is
weakest — the author-coined values. Fixing those first shrinks the need for a judge, and may
remove it.

---

### OQ-10 — Author-coined values in ground truth make part of the metric unreachable — ✅ **closed by ADR-14**

**Measured:** 2026-08-30 · **Implemented:** 2026-08-30 (the deferral below was overridden — the author chose to do the work)

Measured on 2026-08-30 against `miniCRM/benchmark/ground-truth/semantics.json`: 40 of 71 facts have
a string `value`. Most are tokens the agent literally observes and will copy verbatim —
`VERSION_CONFLICT`, `OUT_OF_STOCK`, `EMAIL_EXISTS`, `sid`, `X-CSRF-Token`, `paid` / `refunded`,
`ORDER_CREATED`. For those, the design of [`05`](05-evaluation-and-metrics.md) §2 works as intended:
prose lives in `meaning`, which is not part of the matching key.

About fifteen values are different — author-coined shorthand that appears nowhere in the traffic:

```
csrf-exempt · integer-cents · no-embedded-activity · decrement · restore
non-archived · all-statuses-in-window · nested · country-code
name-or-email · name-or-sku · archived=false · active=true
true|false|omitted · ORD-2026-{id} · round((subtotalCents+shippingCents)*rate)
```

An agent can fully understand that customer search matches name or email and still score FN + FP by
writing `name_or_email`. That is guessing our notation, not recovering a fact. Fifteen of 71 is
roughly 20% of a category weighted 0.25 — up to about 5 VARS points of notation noise. It hits both
systems, so the baseline↔AAE *difference* survives; it depresses absolute scores, adds variance, and
reads as arbitrary to a judge.

**The golden test does not catch this.** `perfect-reconstruction.json` → VARS = 100 passes because
the same author wrote the reference with the same vocabulary. It proves the metric is not broken; it
does not prove 100 is reachable by an outside agent.

Options, both deterministic and both requiring ground-truth regeneration:
(a) restructure these facts so `value` is a structured object — the pattern already used by
`derived_value` and `state_transition` (`{"searches": ["name", "email"]}`); (b) publish the notation
vocabulary in the evaluation config without binding values to subjects, the same argument as the
`kind` enum in ADR-12.

**Correction on "(a) gives no hint."** It does. A structured `value` moves the author's wording from
the value into the *key* (`{"searches": [...]}` — where does `searches` come from?). The only way
option (a) is fair is if the shape of `value` is declared **per `kind`** in the output schema, the
same nine-way contract as ADR-12: nine value shapes, never a shape bound to a specific subject or
endpoint. Then the hint is "facts of this kind have these fields" — a vocabulary — and the agent
still has to discover which endpoint has which values. There is no zero-hint option; there is only
a choice of which hint is defensible.

**Decision under the real deadline (OQ-1, ~1 day left): do neither now.** Both options require
regenerating ground truth and re-checking cases, and neither buys a point in the rubric. The noise
hits baseline and AAE equally, so the *comparison* — which is what Measured Improvement scores —
survives untouched. The cheap, honest handling is:

- state the limitation in the report, with the count and the list;
- report per-category F1 next to VARS so a reader can see where the loss sits;
- if a run shows these facts dominating the error budget, exclude them from scoring the way ADR-8
  excludes facts no case can reach — same precedent, one config change, no regeneration.

Revisit only if the benchmark outlives the hackathon. Scope check still owed for
`dependencies.json` and `workflows.json`, which were not measured.

---

### OQ-11 — ADR-6 calls `miniCRM/` its own repository; in fact there is one repository at the root

**Priority:** low · **Affects:** Reproducibility (15)

ADR-6 describes `miniCRM/` as a separate git repository. In the working tree there is a single
repository at the project root with one commit, no submodule and no `.gitmodules`.

Either make it real (submodule or subtree, so the target can be checked out at a pinned
`application_commit` independently of the tooling), or restate the intent as logical
self-containment rather than a git boundary. Worth settling before the reproduction guide is
written, since that guide will tell a judge what to clone.

---

### OQ-13 — Does the full-corpus scope contain facts no browser session can reach?

**Priority:** medium · **Affects:** [`05`](05-evaluation-and-metrics.md), the published recall ceiling

ADR-8 says a *case* only scores browser-observable facts. The published pair is scored with `--all`,
which applies no case filtering — so if the corpus holds facts that no amount of UI exploration can
expose, the recall ceiling for both systems is below 1.00 by an unknown margin, and `semantic_facts`
recall of 0.30 is being measured against an unreachable denominator.

This does not affect the comparison: both systems face the identical ceiling. It affects how the
absolute numbers should be read, and it is the strongest argument for building the runner and
scoring per case. Until it is answered, absolute recall figures in this project are reported as
"of the full corpus", never as "of what was reachable".

---

### OQ-14 — Should the baseline get a per-section submission as a fifth control point?

**Priority:** medium · **Affects:** the attribution of the iteration-1 gain

AAE differs from the baseline in two ways at once: it is multi-agent, and it writes its document in
sections rather than in a single serialization. A baseline variant that keeps the single loop but
submits section by section would separate "the ensemble won" from "one-shot serialization was the
bottleneck". Given the measured failure mode — the agent had the knowledge and did not transcribe it
— this is a live alternative explanation, not a pedantic one.

One run set answers it. It was not run before the deadline, and the claim in
[`06`](06-baseline-and-changelog.md) §3 is worded to leave room for it.
