# 10. Review of the original RU document's claims

> **Status:** frozen (audit performed 2026-08-29; a re-review adds a new section, it doesn't edit the old one)
> **Updated:** 2026-08-29
> **Document reviewed:** `Autonomous_API_Explorer_Technical_Documentation_RU.pdf`, v1.0 dated 2026-08-29, 18 pages
> **Checked against:** `micro1 - First Hackathon97ce7c5.pdf` (the brief) and the MiniCRM repository at commit `a287351`

The concept document was written before reconciliation with the code and before a full read of the
brief. It contains a sound strategy and several factual errors. This file records the result of a
line-by-line check so the errors don't carry over into the submission.

---

## 1. Errors: claims that contradict the code or the brief

| # | PDF claim | What's actually true | Source | Consequence |
| --- | --- | --- | --- | --- |
| E-1 | Example: "`PATCH /api/orders/{id}` with body `{"status": 4}` → shipped" | The real route is `PATCH /api/orders/{id}/status`, body `{statusId, version}`, value `40`. A separate `PATCH /api/orders/{id}` exists, but changes `paymentStatus` and **is not reachable from the UI** | `miniCRM/apps/api/src/routes/orders.ts`, `miniCRM/apps/api/src/domain/status.ts` | The document's flagship example is wrong on all three counts: path, field name, and value |
| E-2 | Canonical vocabulary: `new, confirmed, processing, shipped, cancelled` | Actual: `Draft (10), Confirmed (20), Processing (30), Shipped (40), Cancelled (50)`. There is no `new` label | `miniCRM/apps/web/src/orderStatus.ts` | Publishing the wrong vocabulary would have broken the evaluator's matching |
| E-4 | Output schema: sections `enum_mappings`, `operation_effects`, `triggers`, `business_rules` | Implemented schema: `operations`, `semantic_facts` (with a `kind` field), `dependencies`, `workflows`, `actions`, `claims` | `miniCRM/benchmark/schemas/reconstruction-output.schema.json` | The PDF's VARS weights are computed over categories that don't exist |
| E-8 | Evidence model: an evidence registry with stable `ev_NNN` ids and an `evidence_ids` field on facts; the evaluator checks referential integrity | The implemented schema has **no evidence identifiers at all**. Evidence is nested inside the fact/claim as an array of objects with a required `kind` from seven values. The string `evidence_id` appears zero times in the schema. The field `canonical_meaning` is also absent — the schema calls it `meaning` | `miniCRM/benchmark/schemas/reconstruction-output.schema.json`, `definitions.evidence`, `definitions.semanticFact` | The most serious discrepancy after E-1: the entire provenance mechanism described in the PDF doesn't apply as written. Resolved into two levels in [`08`](08-evidence-and-trajectories.md) §2 |
| E-5 | Repo layout: `apps/minicrm/`, `benchmarks/`, `packages/schema`, `packages/evaluator`, `packages/browser-harness`, `agents/` | Actual: `miniCRM/apps/api`, `miniCRM/apps/web`, `miniCRM/benchmark/`, `miniCRM/db/`, `miniCRM/tests/`. There are no evaluator, harness, or agent packages | repository | The PDF calls the layout "recommended," i.e. a proposal rather than a description. But it can't be relied on for planning: the actual paths differ |
| E-6 | The target's MVP scope includes "Payments / tasks" as related entities | There is no `tasks` entity at all. Payments are represented only by the order's `payment_status` field, which **cannot be changed from the UI** | `miniCRM/db/migrations/001_initial.sql`, `miniCRM/apps/api/src/routes/orders.ts` | Claimed coverage is broader than actual |
| E-7 | The MVP supports "cookie **or** Bearer auth" | The target only has cookie sessions (`sid`, HttpOnly, SameSite=Lax) + the `x-csrf-token` header. No Bearer support | `miniCRM/apps/api/src/session.ts`, `miniCRM/apps/api/src/hooks.ts` | Claiming support with no backing case violates ground rule 09 |

---

## 2. Significant omissions: what's in the brief but missing from the PDF

| # | What's missing | Why it matters |
| --- | --- | --- |
| G-1 | **The 100-point judging rubric and its weights** | The biggest omission. Work priorities should be derived from it: Agent Solution & Engineering = 30, End to End Quality = 20 |
| G-2 | **End to End Quality (20 points)** as a distinct criterion | The brief judges the *finished artifact* — "polished enough that a person would sign off on it, not an obvious AI draft." The PDF mentions artifact generation only in passing |
| G-3 | ~~Ground rule 02~~ — **finding retracted.** The PDF does not actually omit the rule: Appendix C contains "Clearly shows what existed before the competition and what was added." There is no omission | Row kept so the number isn't reused |
| G-4 | **Ground rule 05** — a qualified human reviewer as a *control mechanism* | Partial omission. PDF §7.2 mentions "human review of the finished OpenAPI/docs/workflows," but frames it as a quality-assessment method rather than a mandatory safety requirement. The rule's wording requires the reviewer to be **part of the solution** |
| G-5 | **Human time per task and Cost per task** in the standard brief table | The PDF treats them as "additional metrics." The brief puts them in the main report form |
| G-6 | The brief's explicit permission to propose **your own** rubric | The PDF introduces VARS without referencing this permission — it reads as overreach, even though it's directly allowed |
| G-7 | The brief's list of acceptable baseline forms | Our choice ("general purpose agent with basic tools") is one of the four named forms; worth stating explicitly as compliance |

---

## 3. Outdated: correct as a plan, drifted from fact

| # | PDF claim | Current state |
| --- | --- | --- |
| S-1 | "Ground truth — a dataset separated from the agent" as a plan | Implemented: `miniCRM/benchmark/ground-truth/` with 26 operations, 71 facts, 22 dependencies, 18 workflows, 32 actions |
| S-2 | D-12…D-10 task: "Build MiniCRM: 12 cases, seed/reset, hidden ground truth, deterministic evaluator" | Partially done, and overshot on cases: the target, seed, reset, ground truth, and **15** cases are ready; **the deterministic evaluator is not written** and remains the blocker ([`09`](09-status-and-roadmap.md)) |
| S-3 | Cursor prompts (§14) | Outdated: they describe building what already exists. Only §14.2–14.4 (evaluator, harness, agents) are still relevant |
| S-4 | "Payments / tasks" in the target's domain areas | See E-6 |

---

## 4. Confirmed: conclusions that held up under review

This is the document's solid core, and it's correct.

| # | PDF claim | Verification |
| --- | --- | --- |
| C-1 | The app exposes no OpenAPI spec or value references | ✅ No such route exists; status meaning lives only in the frontend |
| C-2 | Value comes not from crawling but from the cycle "observe → hypothesize → safely test → record what's confirmed" | ✅ Matches the brief: agentic capability applied purposefully |
| C-3 | The baseline should be a general-purpose agent with the same tool surface, not a single prompt | ✅ Explicitly named by the brief as an acceptable form; more honest than a weak baseline |
| C-4 | A deterministic evaluator with no LLM, embeddings, or fuzzy matching | ✅ Delivers reproducibility (Reproducibility criterion, 15 points) |
| C-5 | Ground truth and the target's code never enter the agent's context | ✅ Matches `miniCRM/benchmark/README.md`; otherwise the benchmark would measure a leak |
| C-6 | A separate `reset(seed)` and a hidden ground-truth exporter, unreachable by the browser agent | ✅ Implemented as `npm run db:reset` (out-of-band) and `miniCRM/benchmark/scripts/emit-ground-truth.mjs`. The PDF never stated "there's no HTTP reset endpoint" — that requirement comes from the target's `README.md` and was added by us |
| C-7 | Don't publish numbers before real runs | ✅ Directly matches ground rule 09 |
| C-8 | Five action-risk classes, with `DESTRUCTIVE` and `UNKNOWN` blocked | ✅ Matches ground rule 04 |
| C-9 | "≥10 cases plus a separate hard case" | ✅ A verbatim brief requirement |
| C-10 | The four deliverables and their content | ✅ Matches the brief |
| C-11 | "The brief does not state a deadline date" | ✅ Confirmed: there is no date in the brief |
| C-12 | Requirement for structured tool arguments instead of free-form Markdown | ✅ Otherwise a run couldn't be scored mechanically |

---

## 5. What was done with the findings

| Category | Action |
| --- | --- |
| E-1, E-2, E-4 … E-8 | Corrected in [`02`](02-architecture.md), [`03`](03-target-minicrm.md), [`04`](04-benchmark-contract.md), [`05`](05-evaluation-and-metrics.md), [`08`](08-evidence-and-trajectories.md), [`01`](01-problem-and-value.md) |
| G-1, G-2, G-4 … G-7 | Filled in in [`00`](00-hackathon-requirements.md), [`05`](05-evaluation-and-metrics.md), [`06`](06-baseline-and-changelog.md), [`07`](07-safety.md), [`09`](09-status-and-roadmap.md) |
| G-3, C-12 (previous) | Retracted as incorrect on re-review — see §6 |
| S-1 … S-4 | Current status — [`09`](09-status-and-roadmap.md) §2 |
| C-1 … C-12 | Carried into the corresponding sections as standing decisions |
| S-1 … S-4 (except S-2) | Reflected in the component status |

---

## 6. Retracted findings

The audit was re-checked. Two findings from the first pass turned out to be wrong and are
retracted — the entries are kept, because "we checked this and got it wrong" is more useful than a
line quietly disappearing.

| Former ID | What was claimed | Why it was retracted |
| --- | --- | --- |
| G-3 | The PDF doesn't mention ground rule 02 ("show what existed before the competition") | It does: Appendix C, the line "Complete code + Improvement Changelog" |
| C-12 | The PDF correctly notes that shipping method `methodId: 5` is unreachable | The PDF has no mention of shipping, `methodId`, or "International" anywhere. The fact itself is true (`miniCRM/apps/api/src/domain/shipping.ts` + a seed with only CA and US) and is recorded in `miniCRM/benchmark/GAPS.md`, but attributing it to the reviewed document was a mistake |

Retracted finding IDs are never reused.

---

## 7. Conclusion

The source document's strategy held up under review; its factual content did not. The costliest
discrepancies are E-1 (a wrong flagship example) and E-8 (a nonexistent provenance model): both
concern mechanics that could easily be copied straight into an implementation without a second
look.

The PDF is downgraded to historical-context status and is not a source of truth (see
[`README.md`](README.md) §Hierarchy of sources of truth).
