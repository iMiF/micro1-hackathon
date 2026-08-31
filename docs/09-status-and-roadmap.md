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
documentation, and (per the plan) the harness, agents, evaluator, artifact generator, and runner.

---

## 2. Actual component status

Honest picture as of 2026-08-31, ~12:15 PM Toronto — inside the closing window. Update on every change.

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
| **Baseline agent** | ✅ done, scored | `agents/baseline/` | The published comparison pair runs on the shipped default `openai/gpt-5.6-sol` (ADR-22): `results/runs/baseline-2026-08-31T14-45-38-777Z` → **VARS(frozen) = 49.85** (balanced 59.70, flat 59.14), 127 tool actions of 300, 5m26s, $0.92. A luna replication (`…T16-00-44-545Z` → 33.56 at `maxSteps` 200) and the earlier `anthropic/claude-sonnet-5` run (46.72) stay in [`06`](06-baseline-and-changelog.md) as history / model-independence evidence, not as the comparison point |
| **AAE agent** | ✅ done — iteration 1 landed and scored | `agents/aae/` (commit `5977bd1`) | The ADR-18 asymmetric ensemble: Explorer that never submits, deterministic TrafficMiner and DomainSweeper, Inquisitor, per-section Extractors, deterministic Assembler. Scored on the same sol contract as the baseline: `results/runs/aae-2026-08-31T14-51-18-382Z` → **VARS(frozen) = 71.21** (balanced 78.18, flat 79.00), 264 actions of 300, 18m12s, $3.32. Luna replication: `…T16-04-43-124Z` → 61.12 vs 33.56. The planned coverage planner was **dropped before implementation** (`operations` F1 already 1.00 on the sonnet baseline) and is recorded as a removed experiment in [`06`](06-baseline-and-changelog.md) §3. Ablation switches exist (`AAE_ABLATE=...`); **no ablation run is scored yet** |
| **Benchmark runner** | ❌ missing | — | Runs are launched one at a time; there is no sweep of 15 cases × both systems. Consequence: the published pair is scored with `--all` against the full corpus, not as 15 per-case scores. Per-case scoring itself works (`evaluate.mjs --case <id>`) |
| Submission README | ❌ missing | `README.md` at the repo root | deliverable 01 requires it explicitly: the user and their bottleneck, the value, the before/after boundary of §1 above, and a link to the Improvement Changelog |
| Artifact generator (OpenAPI/docs) | ✅ done | `artifacts/` | Deterministic render of `reconstruction.json` → OpenAPI 3.1 + `API.md`. No LLM, no new facts. Path A drafts: `results/runs/aae-2026-08-31T14-51-18-382Z/artifacts/` and the paired baseline `…/artifacts/`. `npm run artifacts:preview` serves Swagger UI with a dropdown of those drafts (and the committed perfect-reconstruction example, labeled as a reference). Does not affect VARS |
| **Reproduction guide** | ✅ done | [`docs/REPRODUCTION.md`](REPRODUCTION.md) | deliverable 02. Three paths: re-score the shipped sol Path A pair with no API key (deterministic, verified to return 49.85 and 71.21 exactly), run the baseline, run AAE. The luna pair is also in `results/runs/INDEX.md`. Versions, expected output, measured time and cost, and the known limits of the guide are all in it |
| Video | ⚠️ scripted, not recorded | [`VIDEO-SCRIPT.md`](../VIDEO-SCRIPT.md) | deliverable 03. 7 segments, ~736 words ≈ 4:50, with a claim-to-file table for every on-screen assertion. Recording and upload remain |
| **Run trajectories** | ✅ done | `results/runs/INDEX.md` | Path A sol pair plus luna replication pair and repeats are tracked via `.gitignore` exceptions. Each run carries `trajectory.jsonl`, `evidence/evidence.jsonl`, `meta.json` and `summary.json`; AAE additionally carries `claims.jsonl`, `gaps.jsonl`, `pages.jsonl`, `digest.json`, `assemble-log.json` and `prompts/`. Path A directories also carry `artifacts/openapi.json` and `artifacts/API.md` |

**Summary:** the comparison exists. Target, evaluator, harness, baseline, AAE iteration 1 and the
artifact generator are all built, and both systems have
been run on the shipped default (`openai/gpt-5.6-sol`, ADR-22), producing **49.85 → 71.21 VARS(frozen)** — a result that keeps its ordering under all
three weight vectors (ADR-13 obligation #2). A luna replication (33.56 → 61.12) shows the same sign and the same categories, so the delta is not a strong-model artifact. What is still missing is breadth rather than substance: no runner, so the pair is scored
against the full corpus instead of 15 per-case scores; no scored ablation, so each AAE component's individual contribution is argued from
design rather than measured; no B1 control point, so "architecture, not prompt engineering" remains an argument; and one pair rather than a
distribution. The remaining hard blocker for the submission itself is the recorded video.

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

**As of 2026-08-30 there was roughly one working day; as of midday 2026-08-31 the closing window is open.** The order below is by rubric value per hour,
and every line after the first three is optional. If something has to give, it is agent features —
never the quality gates, and never a number that wasn't measured.

| # | Outcome | Gate | Rubric | Status |
| --- | --- | --- | --- | :---: |
| 1 | Freeze the VARS weights (ADR-2) — a 10-minute decision that blocks nothing downstream | Written down before any scored run | Measured Improvement | ✅ done (ADR-13) |
| 2 | Deterministic evaluator | Golden tests of §7 in [`05`](05-evaluation-and-metrics.md) pass; `perfect-reconstruction.json` → VARS = 100 | Measured Improvement 15 | ✅ done |
| 3 | Harness + baseline; one full run end to end | A valid `submit_reconstruction` and a real VARS number on ≥1 case | the floor for everything else | ✅ done — VARS(frozen) 46.72 (pre-ADR-16 44.70), see [`06`](06-baseline-and-changelog.md) |
| 4 | AAE iteration 1: per-section extractors + deterministic assembler (ADR-18) | Each component has an ablation, or it isn't claimed | Agent Solution 30 | ✅ done — landed `5977bd1`, scored **VARS(frozen) 71.21** vs the sol baseline's 49.85 on the shipped default; luna replication 61.12 vs 33.56. Ablation switches exist; **no ablation run is scored**, so per-component contribution is still argued, not measured |
| 5 | Runs on the full case set, both systems, fixed seeds | Full ledger, no cherry-picking | Measured Improvement | ❌ not started — no runner. The published pair is scored with `--all` against the whole corpus, which is not cherry-picking but is also not the 15-case ledger this line asks for |
| 6 | Reproduction guide + submission README | A clean environment reproduces one run | Reproducibility 15 | ⚠️ half done — [`REPRODUCTION.md`](REPRODUCTION.md) is written and its no-API-key path is verified; the root `README.md` (deliverable 01) is **not written** |
| 7 | Video under 5 minutes | Understandable without narration | required deliverable | ⚠️ scripted — `VIDEO-SCRIPT.md`, 7 segments ≈ 4:50, not recorded |
| 8 | Hot take, main failure mode | Written from what the runs showed | 5 | ✅ done — failure mode measured and written in [`06`](06-baseline-and-changelog.md) §4, hot take in `06` §5: the bottleneck was synthesis, not exploration |

**Line 4 is done, and it is what the submission is built on.** The named failure mode was measured rather than guessed
(`06` §4): the baseline explored the target and then submitted a fraction of what it had
seen. Iteration 1 therefore attacked synthesis, not exploration, and the categories it moved on sol are exactly the synthesis ones:
`workflows` F1 0.43 → 0.91, `semantic_facts` 0.14 → 0.43, `dependencies` 0.53 → 0.68. The luna replication moved the same categories
(`workflows` 0.10 → 0.61, `semantic_facts` 0.12 → 0.29). What is left on this line is the ablation set —
the switches are implemented (`AAE_ABLATE`), the runs are not.

**Reasoning is deliberately out of iteration 1** (ADR-20): a thinking budget is model configuration
of the same class as `temperature`, so it is switched on for both systems together in a later
iteration, with **B2** added as a control point so the gain can be attributed instead of asserted.

**Budgets are frozen across systems** (ADR-21), and the published sol pair honors it: both systems ran at the shipped `maxSteps` 300 and
`wallClockMs` 900000, and neither hit the step ceiling — baseline 127 actions, AAE 264. Raising either value for one system means re-running the
other at the new value before any comparison is published. `maxCostUsd` is exempt — it stops a run rather than shaping it. The resource
difference the brief asks to be named is time and money, not budget: AAE spent 3.3× the wall time and 3.6× the cost for its 21.4 points.

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

**The honest fallback, if the clock does win.** Two systems, one case, one measured number, and a reproduction guide that works beats
five agent components and an unmeasured claim. That fallback is now the actual state of the submission, reached deliberately rather than
drifted into: two systems, one measured comparison, a reproduction guide whose primary path needs no API key. What remains unbuilt is
recorded above as unbuilt.

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
2. Artifact generator down to a minimum: OpenAPI without human-readable docs. *(shipped as OpenAPI 3.1 plus a deterministic `API.md` render of the same JSON — still no LLM prose.)*
3. Ablation runs for some components — but then honestly state the contribution isn't isolated.
4. Number of cases — **never below 10** (the brief's threshold), and never at the expense of the
   hard case.

**Never cut:** evaluator determinism, ground-truth isolation, evidence discipline, completeness of
published results. These aren't features — they're the conditions for a fair comparison.
