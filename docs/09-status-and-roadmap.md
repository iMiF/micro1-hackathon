# 09. Status, plan, and quality gates

> **Status:** active — **update on every component status change**
> **Updated:** 2026-08-30
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

Honest picture as of 2026-08-29. Update on every change.

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
| **Deterministic evaluator** | ❌ missing | — | **blocks every comparison** |
| **Browser harness** | ❌ missing | — | **blocks any run** |
| **Baseline agent** | ❌ missing | — | blocks Measured Improvement |
| **AAE agent** | ❌ missing | — | |
| **Benchmark runner** | ❌ missing | — | |
| Artifact generator (OpenAPI/docs) | ❌ missing | — | End to End Quality criterion (20 points) |
| Reproduction guide | ❌ missing | `docs/REPRODUCTION.md` | deliverable 02 |
| Video | ❌ missing | — | deliverable 03 |
| Run trajectories | ❌ missing | `artifacts/runs/` | deliverable 04 |

**Summary:** the target and the measurement infrastructure around it are ready. Everything that
produces and measures a result is not. This is exactly the half that 30 of the 100 points depend
on (Measured Improvement 15 + Reproducibility 15), plus the ability to claim any improvement at
all.

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

| # | Outcome | Gate | Rubric |
| --- | --- | --- | --- |
| 1 | Freeze the VARS weights (ADR-2) — a 10-minute decision that blocks nothing downstream | Written down before any scored run | Measured Improvement |
| 2 | Deterministic evaluator | Golden tests of §7 in [`05`](05-evaluation-and-metrics.md) pass; `perfect-reconstruction.json` → VARS = 100 | Measured Improvement 15 |
| 3 | Harness + baseline; one full run end to end | A valid `submit_reconstruction` and a real VARS number on ≥1 case | the floor for everything else |
| 4 | AAE with the one or two components with the clearest named failure mode | Each has an ablation, or it isn't claimed | Agent Solution 30 |
| 5 | Runs on the full case set, both systems, fixed seeds | Full ledger, no cherry-picking | Measured Improvement |
| 6 | Reproduction guide + submission README | A clean environment reproduces one run | Reproducibility 15 |
| 7 | Video under 5 minutes | Understandable without narration | required deliverable |
| 8 | Hot take, main failure mode | Written from what the runs showed | 5 |

**What is cut, explicitly:** the OQ-10 ground-truth rework (deferred — it costs hours and changes
no ranking), sub-weights inside `semantic_facts` (ADR-2 — adds opacity, not signal), the OQ-9 LLM
judge, multi-agent orchestration (OQ-6), and the OQ-11 repository split.

**The honest fallback.** Two systems, one case, one measured number, and a reproduction guide that
works beats five agent components and an unmeasured claim. Deliverables 5–8 are worth more than
line 4 — if the day runs short, ship the measurement, not the architecture.

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
