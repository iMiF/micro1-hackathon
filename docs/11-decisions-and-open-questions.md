# 11. Decision log and open questions

> **Status:** active — updated as the project proceeds
> **Updated:** 2026-08-30

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

**Date:** 2026-08-29 · **Status:** ⚠️ partially accepted — **weights not approved**

**Context.** The brief asks for a single primary metric and allows proposing our own rubric. The
standard table (`Primary outcome`, `Human time per task`, `Cost per task`) poorly describes API
reconstruction quality, but can't be dropped.

**Decision.** VARS as the primary metric ([`05`](05-evaluation-and-metrics.md)) **plus** the
brief's standard table in full.

**Not yet decided.** The category weights (0.25 / 0.20 / 0.25 / 0.15 / 0.15) are a proposal, not a
decision. They need to be approved **before** the first scored run and then frozen, otherwise
there's a risk of fitting the metric to the result. Whether to add sub-weights inside
`semantic_facts` is still open.

**Deadline:** D-12…D-10.

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

### OQ-3 — Pre-filled login weakens the benchmark

**Priority:** medium · **Affects:** `case-01-auth-session-csrf`

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

### OQ-6 — Is multi-agent orchestration needed

**Priority:** low · **Deadline:** after AAE's first runs

The brief states directly: *"Purposeful choices matter more than the number of components."*
Splitting AAE into multiple agents is justified only if an ablation shows a win. Otherwise it's
unnecessary complexity that costs points rather than earning them.

Decide **after** the single-agent version's real failure mode becomes visible.

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

### OQ-10 — Author-coined values in ground truth make part of the metric unreachable

**Priority:** ~~high~~ deferred (see the decision at the end) · **Measured:** 2026-08-30

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
