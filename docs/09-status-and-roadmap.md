# 09. Status, plan, and quality gates

> **Status:** active — **update on every component status change**
> **Updated:** 2026-08-31
> **Source of truth:** repository state; brief §"Final deliverables"

---

## 1. What existed before the competition and what was added

**Ground rule 02** requires this boundary to be shown clearly. This section is copied into the
submission README.

### Existed before the competition

Only general-purpose third-party components, used under license (ground rule 03): Node.js,
Fastify, Vue 3, Vite, TypeScript, PostgreSQL, Playwright, docker compose, and their dependencies.

**There was no code of our own before the competition.** The `miniCRM/` target repository's
history begins on 2026-08-28:

| Commit | Date | Content |
| --- | --- | --- |
| `7f1ba50` | 2026-08-28 | Initial commit — the MiniCRM app |
| `a287351` | 2026-08-28 | Benchmark artifacts for evaluating MiniCRM |

### Added during the competition

Everything else: the MiniCRM app, the case set, ground truth, the output schema, this
documentation, and (per the plan) the harness, agents, evaluator, and runner.

---

## 2. Actual component status

Honest picture as of 2026-08-31 (~2 AM Toronto, deadline day). Update on every change.

| Component | Status | Where | Comment |
| --- | :---: | --- | --- |
| MiniCRM target app | ✅ done | `miniCRM/apps/api`, `miniCRM/apps/web`, `miniCRM/db/` | 28 routes, 26 UI-reachable |
| Deterministic seed and reset | ✅ done | `miniCRM/apps/api/src/seed.ts`, `npm run db:reset` | out-of-band, no HTTP endpoint |
| API tests and e2e smoke | ✅ done | `miniCRM/apps/api/test`, `miniCRM/tests/e2e` | |
| Source audit | ✅ done | `miniCRM/benchmark/INVENTORY.md`, `miniCRM/benchmark/GAPS.md` | |
| Ground truth (machine-readable) | ✅ done | `miniCRM/benchmark/ground-truth/` | 26 operations, 71 semantic facts, 22 dependencies, 18 workflows, 32 actions |
| Case set | ✅ done | `miniCRM/benchmark/cases.json` | 15 cases, all facts checked against the UI (ADR-8) |
| Output schema | ✅ done | `miniCRM/benchmark/schemas/reconstruction-output.schema.json` | draft-07, `additionalProperties: false`, nine `semanticFact.kind` values |
| Ground truth validator | ✅ done | `miniCRM/benchmark/scripts/validate-ground-truth.mjs` | parsing, schema, referential integrity |
| Reference reconstruction | ✅ done | `miniCRM/benchmark/examples/perfect-reconstruction.json` | All 71 facts with the same `kind` values as ground truth: golden test for VARS = 100 |
| **Deterministic evaluator** | ✅ done | `evaluator/` | node/ajv, no LLM/embeddings/fuzzy-matching; all 7 required golden tests (docs/05 §7) + regression tests green; `perfect-reconstruction.json` → VARS 100 on all three weight vectors |
| **Browser harness** | ✅ done | `harness/` | seven tools, risk gate, evidence, path normalization (placeholder-name fix landed 2026-08-30, see project memory) |
| **Baseline agent** | ✅ done, one run scored | `agents/baseline/` | validated across 5 models via smoke runs (`config/run.local.json`); best recorded official artifact is `anthropic/claude-sonnet-5` at **VARS(frozen) = 46.72** (pre-ADR-16 44.70), see [`06`](06-baseline-and-changelog.md). After ADR-16 a sol smoke run scores 51.2 on the same contract; the Baseline row was not retargeted. **`config/run.default.json` still pins `anthropic/claude-opus-4.6`, which has not been run** — see the model-deviation note in `06` §3 |
| **AAE agent** | ❌ missing | `agents/aae/` (README only) | Component set revised 2026-08-31 from the baseline measurement (**ADR-18**): asymmetric multi-agent — Explorer, TrafficMiner, DomainSweeper, Inquisitor, per-section Extractors, deterministic Assembler. The planned coverage planner was **dropped before implementation** (`operations` F1 already 1.00) and is recorded as a removed experiment in [`06`](06-baseline-and-changelog.md) §3. Build brief for the implementer: [`AAE-BUILD-PROMPT.md`](../AAE-BUILD-PROMPT.md) |
| **Benchmark runner** | ❌ missing | — | individual runs launched manually so far, not a runner sweeping all 15 cases × both systems |
| Artifact generator (OpenAPI/docs) | ❌ missing | — | End to End Quality criterion (20 points) |
| Reproduction guide | ❌ missing | `docs/REPRODUCTION.md` | deliverable 02 |
| Video | ❌ missing | — | deliverable 03 |
| Run trajectories | ⚠️ partial | `results/runs/` | 21 individual runs exist (smoke tests across models/scopes), not yet the full 15-case × both-systems ledger deliverable 04 expects |

**Summary:** the target, the measurement infrastructure, and a working baseline are now ready and a
first score exists. What's missing is the comparison itself: AAE has no iterations yet, so there is
nothing to compare the baseline number against, and the runner that would sweep all 15 cases for
both systems doesn't exist. Given the deadline (§4), this is the critical remaining gap — Measured
Improvement (15 points) needs at least one AAE iteration scored the same way as the baseline row
above.

---

## 3. Critical path

```
Evaluator ──┐
            ├──► First scored baseline run ──► AAE iterations ──► Final comparison
Harness  ──┘                                                              │
                                                                           ▼
                                          Artifact generator ──► Video + reproduction guide
```

The evaluator and the harness can be built in parallel — they don't depend on each other.
Everything else is sequential.

---

## 4. Plan for the time that actually remains

**The deadline is known (OQ-1 resolved 2026-08-30):** the challenge runs Aug 28 – Aug 31, 2026,
closing 11:00 AM – 2:00 PM America/Toronto on Aug 31. The 14-day table this section used to contain
was written against a runway that never existed and has been replaced.

**As of 2026-08-30 there is roughly one working day.** The order below is by rubric value per hour,
and every line after the first three is optional. If something has to give, it is agent features —
never the quality gates, and never a number that wasn't measured.

| # | Outcome | Gate | Rubric | Status |
| --- | --- | --- | --- | :---: |
| 1 | Freeze the VARS weights (ADR-2) — a 10-minute decision that blocks nothing downstream | Written down before any scored run | Measured Improvement | ✅ done (ADR-13) |
| 2 | Deterministic evaluator | Golden tests of §7 in [`05`](05-evaluation-and-metrics.md) pass; `perfect-reconstruction.json` → VARS = 100 | Measured Improvement 15 | ✅ done |
| 3 | Harness + baseline; one full run end to end | A valid `submit_reconstruction` and a real VARS number on ≥1 case | the floor for everything else | ✅ done — VARS(frozen) 46.72 (pre-ADR-16 44.70), see [`06`](06-baseline-and-changelog.md) |
| 4 | AAE iteration 1: per-section extractors + deterministic assembler (ADR-18) | Each component has an ablation, or it isn't claimed — and here every ablation is a run that already exists | Agent Solution 30 | ❌ not started — **next up** |
| 5 | Runs on the full case set, both systems, fixed seeds | Full ledger, no cherry-picking | Measured Improvement | ❌ not started |
| 6 | Reproduction guide + submission README | A clean environment reproduces one run | Reproducibility 15 | ❌ not started |
| 7 | Video under 5 minutes | Understandable without narration | required deliverable | ❌ not started |
| 8 | Hot take, main failure mode | Written from what the runs showed | 5 | ❌ not started (hypothesis in `06` §4 is holding: `semantic_facts` F1 = 0.13 is the worst category in the scored run) |

**Given how little runway is left (deadline today, §4 above), line 4 is the fastest path to the
next scoreable rubric point.** The named failure mode is now measured rather than guessed
(`06` §4): the baseline explored completely — `coverage` 1.00, `operations` F1 1.00 — and then
submitted 21 of 71 semantic facts, 10 of 22 dependencies and 3 of 17 workflows. Iteration 1
therefore attacks synthesis, not exploration. Lines 6–8 depend on having at least that comparison
to write about.

**Reasoning is deliberately out of iteration 1** (ADR-20): a thinking budget is model configuration
of the same class as `temperature`, so it is switched on for both systems together in a later
iteration, with **B2** added as a control point so the gain can be attributed instead of asserted.

**Budgets are frozen across systems** (ADR-21). The baseline row used 179 of 200 steps; raising
`maxSteps` or `wallClockMs` for AAE means re-running the baseline at the new value before any
comparison is published. `maxCostUsd` is exempt — it stops a run rather than shaping it.

**Nothing is cut by the clock.** The ordering above is by rubric value per hour, not a list of
survivors: a deadline reorders priorities, it does not decide what gets dropped. That decision is
the author's, and until he makes it every open item stays open. Two things follow. Effort is
estimated for a model doing the implementation, not a person — work that reads as "half a day" in
human hours is often one pass, and scoping it out on human-speed assumptions loses real value for
nothing. And an item that has not been started is recorded as *not started*, never as *cut*.

Still open and unstarted, in no particular order: the OQ-9 semantic-agreement layer, multi-agent
orchestration (OQ-6), the OQ-11 repository split, and the `dependencies` field-reference notation
noted in ADR-14. Sub-weights inside `semantic_facts` are the one genuine rejection, decided on
merit rather than on time (ADR-13).

**The honest fallback, if the clock does win.** Two systems, one case, one measured number, and a
reproduction guide that works beats five agent components and an unmeasured claim. If time runs out
mid-flight, deliverables 5–8 are protected before line 4 — but that is a fallback to invoke
deliberately, not a plan to drift into.

---

## 5. Scope stop condition

> **If, by D-5, a resettable target, a deterministic evaluator, and a working baseline aren't
> ready — stop adding agent features.**

Rationale, plainly: without a fair, measurable foundation, the final system can't prove an
improvement. The rubric awards 15 points for Measured Improvement and 15 for Reproducibility —
those 30 points are unreachable without an evaluator, no matter how clever the agent is. And the
30 points for Agent Solution & Engineering are awarded for **justified** decisions, and
justification comes from measurement.

Visual complexity without measurement is worse than a simple system with honest numbers.

---

## 6. What to cut first if time runs short

In increasing order of pain:

1. Number of AAE iterations — three substantive iterations beat five shallow ones.
2. Artifact generator down to a minimum: OpenAPI without human-readable docs.
3. Ablation runs for some components — but then honestly state the contribution isn't isolated.
4. Number of cases — **never below 10** (the brief's threshold), and never at the expense of the
   hard case.

**Never cut:** evaluator determinism, ground-truth isolation, evidence discipline, completeness of
published results. These aren't features — they're the conditions for a fair comparison.
