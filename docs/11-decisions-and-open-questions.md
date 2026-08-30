# 11. Decision log and open questions

> **Status:** active — updated as the project proceeds
> **Updated:** 2026-08-29

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


## Open questions

### OQ-1 — Actual deadline date

**Priority:** high · **Blocks:** the whole plan in [`09`](09-status-and-roadmap.md)

The brief has no date. It needs to come from the organizers' email or landing page. Until then, the
plan is anchored to D-0.

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
