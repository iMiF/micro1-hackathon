# 09. Status, plan, and quality gates

> **Status:** active — **update on every component status change**
> **Updated:** 2026-08-29
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

## 4. Day-by-day plan

The brief **does not state** a deadline date (OQ-1). The plan is anchored to D-0 — the actual
submission day. If there's less time, cut **scope**, not quality gates.

| Window | Outcome | Quality gate |
| --- | --- | --- |
| **D-14 – D-13** | MVP, public contract, risk policy, and reproducible environment locked in | Schema is versioned; target scope is frozen |
| **D-12 – D-10** | Metric weights approved (ADR-2); deterministic evaluator written | Evaluator passes golden tests and produces `diff.json`; `perfect-reconstruction.json` gives VARS = 100 |
| **D-9 – D-8** | Browser harness and general-purpose baseline; first trajectories | Baseline completes a valid `submit_reconstruction` on at least 10 cases |
| **D-7 – D-5** | Coverage planner, hypothesis ledger, active experiments | Every component has a named failure mode and an ablation run |
| **D-4** | Verifier, evidence bundle, OpenAPI/docs generation | No claims without evidence or an explicit uncertainty flag |
| **D-3** | Baseline and final runs on fixed seeds; full ledger | Fairness checklist signed off; no cherry-picking |
| **D-2** | Submission README, reproduction guide, changelog; trajectories selected | A clean environment reproduces one full run |
| **D-1** | Video under 5 minutes; links and artifacts checked | The video is understandable without narration |
| **D-0** | Final smoke test and submission | All four deliverables are available to the judge |

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
