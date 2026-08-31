# Autonomous API Explorer (AAE)

**An agentic system that turns the observed behavior of an undocumented web application into
verifiable API documentation — where every claim points at the observation that produced it.**

Submission to the **micro1 Agentic Workflows Hackathon** (Aug 28–31, 2026).

> ### Headline result
>
> On the same target, the same seven tools, the same task prompt, the same model and the same
> budget, replacing one general-purpose browser agent with an asymmetric ensemble moved the
> primary metric from **VARS 49.85 → 71.21 (+21.37)** — and the ranking holds under all three
> weight vectors, at 3.6× the cost and 3.3× the wall time.
>
> Reproduce that number in about two minutes, with no API key, no Docker and no network:
> [Quickstart](#quickstart-2-minutes-no-api-key) · full guide in
> [`docs/REPRODUCTION.md`](docs/REPRODUCTION.md).

---

## 1. Who has this problem

**An integration or backend engineer who has to connect to an internal or legacy web application
that has no up-to-date API documentation.**

Concretely: someone handed access to a staging environment for a system they did not build, with a
few days to work out which HTTP operations exist, what the parameters are, what the numeric enums
mean, and which business rules the server enforces silently. The same value lands for migration
teams, QA/SDET writing API tests without a spec, platform engineering inventorying services before
an API gateway, and technical due diligence on someone else's system.

### The bottleneck

Today the path is: open DevTools, click around, jot down requests, guess at field meanings, ask
whoever "sort of knew," write it up, and discover a month later that half of it was wrong. It
breaks in three specific places:

1. **HTTP traffic alone does not carry meaning.** `PATCH /api/orders/12/status` with
   `{"statusId": 40, "version": 3}` shows the shape, not the meaning. What is `40`? Why is
   `version` required? The answer lives in the chain *UI action → request → response → new UI
   state*, not in the request.
2. **Hidden dependencies are invisible in a single request.** Creating an order in our target
   requires `suggest → addresses → shipping/options → order-quotes → orders`, where an opaque
   `quoteId` carries state between steps and expires in 10 minutes. No HAR file tells you that
   identifier cannot be reused.
3. **Plausible guesses cost more than gaps.** An LLM handed a HAR file will cheerfully write
   "`status: 4` means shipped." The engineer who believes it finds the bug in production.
   Documentation that marks the unknown as unknown is worth more than documentation that is
   confident and wrong.

### Why solving it is valuable

The deliverable is not text — it is the ability to integrate safely. The difference is between
"two days of digging with a real risk of getting it wrong" and "a spec that states, for every
claim, which observation it rests on." That is why the mechanism here is not crawling but
experimental reverse engineering: **observe → hypothesize → safely test → record only what is
confirmed.** Having seen `statusId: 40` once, the agent does not name it; it finds another order,
clicks the button with the visible label, and checks whether the result matches.

Full version, including positioning against DevTools/HAR, traffic-to-spec scanners and manual
reverse engineering: [`docs/01-problem-and-value.md`](docs/01-problem-and-value.md).

---

## 2. The measured result

Primary metric: **VARS — Verified API Reconstruction Score** (0–100), a weighted F1 across five
categories of a machine-readable reconstruction, computed by a deterministic evaluator with no
LLM, no embeddings and no fuzzy matching. Definition and weights:
[`docs/05-evaluation-and-metrics.md`](docs/05-evaluation-and-metrics.md).

| METRIC | SIMPLE BASELINE | AGENT SOLUTION | CHANGE |
| --- | --- | --- | --- |
| **Primary outcome — VARS (frozen weights)** | **49.85** | **71.21** | **+21.37** |
| Human time per task | one command, then unattended | one command, then unattended | not separating (see note) |
| Cost per task | $0.92 | $3.32 | 3.6× |
| Wall time per task | 5m26s | 18m12s | 3.3× |

> **On human time.** Both systems run unattended after a single command, so operator time is
> identical and does not distinguish them; the human time of the *manual* process is not measured
> (recorded as open question OQ-5 in [`docs/11`](docs/11-decisions-and-open-questions.md)) and is
> therefore not claimed anywhere in this submission.

Under the hood, the movement is concentrated exactly where the measured failure mode was:

| | baseline | AAE | |
| --- | --- | --- | --- |
| VARS (frozen) | 49.85 | 71.21 | +21.37 |
| VARS (rejected_balanced) | 59.70 | 78.18 | +18.48 |
| VARS (rejected_flat) | 59.14 | 79.00 | +19.86 |
| operations F1 | 0.94 | 1.00 | |
| parameters F1 | 0.91 | 0.93 | |
| **semantic_facts F1** | **0.14** (recall 0.08) | **0.43** (recall 0.30) | the core value |
| **workflows F1** | **0.43** | **0.91** | |
| dependencies F1 | 0.53 | 0.68 | |
| hallucination rate | 0.12 | 0.18 | rose — stated, not hidden |
| evidence support rate | 1.00 | 1.00 | |
| coverage | 1.00 | 1.00 | |
| tool actions | 127 / 300 | 264 / 300 | 2.1× |

Evidence: `results/runs/baseline-2026-08-31T14-45-38-777Z/` and
`results/runs/aae-2026-08-31T14-51-18-382Z/`. Both `openai/gpt-5.6-sol`, `temperature 0`,
`maxSteps 300`, `wallClockMs 900000`, scored `--all` against the full ground-truth corpus.

**Why three weight vectors.** The weights were frozen before the first scored run (ADR-13), and
every evaluator invocation also prints the score under two rejected vectors. The ordering is the
same under all three — which is the answer to "you tuned the weights until you won."

---

## 3. Quickstart (2 minutes, no API key)

Scoring in this project is a deterministic program. The headline comparison can be re-derived from
the shipped artifacts without running an agent, starting a database or contacting any network:

```bash
npm install
cd evaluator && npm install && cd ..

node evaluator/bin/evaluate.mjs \
  --submission results/runs/baseline-2026-08-31T14-45-38-777Z/reconstruction.json \
  --meta       results/runs/baseline-2026-08-31T14-45-38-777Z/meta.json \
  --all --out /tmp/score-baseline     # → VARS 49.85

node evaluator/bin/evaluate.mjs \
  --submission results/runs/aae-2026-08-31T14-51-18-382Z/reconstruction.json \
  --meta       results/runs/aae-2026-08-31T14-51-18-382Z/meta.json \
  --all --out /tmp/score-aae          # → VARS 71.21
```

Requires Node ≥ 22 (the repo reads `.env` with the built-in `process.loadEnvFile`, so there is no
`dotenv` dependency).

Running the agents yourself — target setup, credentials, browser, the exact commands, expected
output, measured time and cost, and the guide's own known limits — is
**[`docs/REPRODUCTION.md`](docs/REPRODUCTION.md)** (three paths: A re-score, ~$0; B baseline, ~$1;
C AAE, ~$3.50).

---

## 4. What is in this repository

| Path | What it is |
| --- | --- |
| `miniCRM/` | **The target.** A synthetic CRM (Fastify + Vue 3 + PostgreSQL), 28 routes, 26 reachable through the UI. Also holds `benchmark/` — ground truth, cases, output schema — because ground truth is generated from the target's own code |
| `miniCRM/benchmark/ground-truth/` | 26 operations, 71 semantic facts, 22 dependencies, 18 workflows, 32 actions. Generated by `benchmark/scripts/emit-ground-truth.mjs`, never hand-edited |
| `harness/`, `tooling/` | The browser harness: Playwright/Chromium, the seven tools, the risk gate, path normalization, the evidence store, the LLM client. Mechanics only — no agent policy |
| `agents/baseline/` | The baseline: one general-purpose browser agent |
| `agents/aae/` | AAE iteration 1 — the asymmetric ensemble (Explorer, TrafficMiner, DomainSweeper, Inquisitor, Extractors, Assembler) |
| `evaluator/` | The deterministic scorer (Node + ajv). No LLM, no embeddings, no fuzzy matching, no network |
| `config/` | Run configuration and the shared task prompt |
| `results/runs/<run-id>/` | Trajectories, evidence, submissions and scores — deliverable 04 |
| `docs/` | Project documentation, 14 files, indexed in [`docs/README.md`](docs/README.md) |
| `VIDEO-SCRIPT.md` | The script for deliverable 03 |

`agents/baseline/` and `agents/aae/` are separate trees that never import each other, and neither
`docs/` nor `miniCRM/benchmark/` is ever reachable from an evaluated agent's context — the agent
sees only the running UI at `http://localhost:5173` and same-origin `/api` traffic.

### The instructions that shape each agent

Required by deliverable 01 and kept as files, not as strings in code:

| File | Whose instruction | Role |
| --- | --- | --- |
| `config/task-prompt.md` | **both systems, byte-identical** | Start URL, goal, output contract, epistemic rules, budgets. This is benchmark *input*: two systems given different task statements would be solving different tasks |
| `agents/baseline/system-prompt.md` | baseline | The honest-minimal single-agent prompt (ADR-11) — the strongest one prompt a competent engineer writes in an hour without architecture |
| `agents/aae/prompts/` | AAE | Explorer, Inquisitor and per-section Extractor prompts — the *scaffolding*, which is the thing being measured |
| `config/run.default.json` | the run | Model, budgets, seeds, risk policy, target credentials |

---

## 5. How it works

**The decision is separated from the action.** The model has no network or `localhost` access. A
local runner drives Chromium through Playwright, executes tool calls, and hands the model only
permitted context. Three consequences: everything the agent knows arrived as recorded evidence;
risk policy is enforced in the harness, before an action runs, not in a prompt; and leaking ground
truth into the context is physically impossible, because the harness never has it.

Both systems see exactly the same seven tools:

```
observe_page()  click(id)  fill(id, value)  select(id, value)  go_back()
get_network_events()  submit_reconstruction(reconstruction)
```

**Baseline** — one general-purpose agent that explores, decides and submits in the same loop. This
is the brief's "one general-purpose agent with basic tools," deliberately built strong: same
target, same tools, same output schema, same budgets. A weak baseline produces an impressive
number and weak work.

**AAE iteration 1 — an asymmetric ensemble (ADR-18)**, in which no role can be confused with
another:

- **Explorer** — explores the target and *cannot submit at all*;
- **TrafficMiner** and **DomainSweeper** — deterministic passes over the recorded traffic;
- **Inquisitor** — proposes only refutation experiments against weakly-supported claims;
- **Extractors** — per-section LLM passes over the recorded evidence, run in parallel, one job each;
- **Assembler** — deterministic; it is what calls `submit_reconstruction`.

The design is not "more components." It is a direct response to what the baseline's own numbers
said the failure mode was (§7). Architecture in full:
[`docs/02-architecture.md`](docs/02-architecture.md); the fairness contract:
[`docs/04-benchmark-contract.md`](docs/04-benchmark-contract.md).

---

## 6. Improvement Changelog

Full version with every number and its run directory:
**[`docs/06-baseline-and-changelog.md`](docs/06-baseline-and-changelog.md) §3.** An entry is added
when a run *has been performed*, never when a change was merely written, and the evidence column is
a run directory rather than a description.

| STAGE | WHAT YOU TRIED AND WHY | EVIDENCE | DECISION / LEARNING |
| --- | --- | --- | --- |
| **Baseline** (history) | General-purpose browser agent, seven tools, one shared instruction — a fair reference point on the same tool surface | `results/runs/baseline-2026-08-31T05-30-26-386Z/` — `anthropic/claude-sonnet-5`, 179 actions, 675s, $4.50 | **VARS 46.72.** `operations` F1 1.00, `coverage` 1.00 — and `semantic_facts` F1 0.13, `workflows` 0.10. Named the failure mode as synthesis, not coverage |
| **Baseline** (published pair) | The same agent, unchanged, re-run on `openai/gpt-5.6-sol` at `maxSteps` 300, because a comparison is only honest inside one model and one budget | `results/runs/baseline-2026-08-31T14-45-38-777Z/` — 127 actions, 5m26s, $0.92 | **VARS 49.85.** Same shape on a different model: complete exploration, one-third of it written down (`semantic_facts` recall 0.08) |
| **Iteration 1 — asymmetric ensemble (ADR-18)** | Split the single loop into roles that cannot be confused: an Explorer that never submits, deterministic miner/sweeper passes, an Inquisitor that only refutes, parallel per-section Extractors, a deterministic Assembler. Chosen because the baseline's numbers named synthesis — not coverage — as the failure | `results/runs/aae-2026-08-31T14-51-18-382Z/` — same model, budget and tools; 264 actions, 18m12s, $3.32 | **VARS 71.21 (+21.37), ranking stable under all three weight vectors. Kept.** Movement concentrated in synthesis: `workflows` 0.43 → 0.91, `semantic_facts` 0.14 → 0.43, `dependencies` 0.53 → 0.68. Resource difference, as the brief requires it be named: 2.1× actions, 3.3× time, 3.6× cost. Hallucination rose 0.12 → 0.18 — writing down three times as much means being wrong out loud more often |
| **Removed — coverage planner** | The pre-measurement design led with a component whose job was to make sure every operation got reached. It was cut **before a line of it was written** | `results/runs/baseline-2026-08-31T05-30-26-386Z/` — `operations` F1 1.00, `coverage` 1.00 | **Removed.** There was no failure mode left for it to eliminate. The lesson: a component earns its place by the failure mode it removes *in a measurement*, not by how reasonable it looks in an architecture diagram. This is what redirected iteration 1 from exploration to synthesis |
| Iteration 2 — reasoning budget (ADR-20) | *not started* | — | Deliberately deferred: a thinking budget is model configuration of the same class as `temperature`, so it gets switched on for both systems together, with a control point, or the gain is asserted rather than attributed |
| Iteration 3 — verifier | *not started* | — | `verifier.enabled` is `false` in `config/run.default.json`; the switch exists, the component does not |
| Ablation set | *not started* | — | `AAE_ABLATE=miner,sweeper,inquisitor,extractors` is implemented and self-tested, but no ablation run is scored — so each component's individual contribution is argued from design, not measured |
| **Final** | = Iteration 1. No further iteration was run before the deadline | the two run directories above | **49.85 → 71.21 VARS**, one model, one budget, one contract, three weight vectors, both trajectories published |

---

## 7. Main failure mode

**Hypothesis before measurement** (recorded 2026-08-30, kept unedited): the costly failure would be
*confidently wrong semantics* — a plausible explanation of a numeric value built on one
observation.

**What the run actually measured:** half right, and the wrong half matters more. Precision on
`semantic_facts` was indeed poor, so confidently-wrong semantics is real. But the dominant term is
**recall: 0.08.** The baseline submitted 21 facts where the corpus holds 71, 10 dependencies of 22,
3 workflows of 17 — while scoring `coverage` 1.00, `operations` F1 1.00 and `evidence_support_rate`
1.00. Nothing was missing from its evidence store.

The control for the obvious objection that this is a scoring artifact is ADR-16: it normalized
every notation variant these reconstructions were losing on, and re-scoring the identical files
moved VARS 44.70 → 46.72. Under two points. What is missing was never written down.

So the failure mode is not bad exploration or bad reasoning. **The agent explored completely and
then wrote down a third of what it had seen.** The clearest instance: it produced a single fact
whose `meaning` string listed every value of an enum correctly, where the corpus holds one fact per
value. The knowledge was present; the accounting was not.

---

## 8. Hot take

**The bottleneck of an exploration agent is not exploration. It is writing down what it already
saw.**

The baseline reached every corner of the target and then submitted a fraction of it. The single
loop had to explore *and* account for what it explored in the same breath, and accounting lost
every time, because one more click always looks more productive than one more line of bookkeeping.

Iteration 1 changed nothing about how the target is explored. It changed **who writes**: the
Explorer lost the ability to submit at all, and a separate set of per-section Extractors reads the
recorded evidence with one job each. That moved 21.4 VARS, concentrated exactly in the synthesis
categories, at 2.1× the actions.

Two things follow for anyone building this kind of agent. **First: measure the failure mode before
you pick the component.** Our own pre-measurement design led with a coverage planner that the first
real run proved had nothing to do — we would have built it, seen no movement, and concluded that
scaffolding does not help. **Second: when one agent is asked to both act and account, the
accounting is what silently degrades.** Separating those roles cost more calls and more money and
bought more than either. That trade is worth naming out loud, because it is the opposite of the
usual advice to keep the agent simple: here the simple agent was not less capable, it was less
*diligent* — and diligence is what documentation is made of.

---

## 9. What existed before the competition, and what was added

Required by ground rule 02.

**Existed before:** only general-purpose third-party components, used under license — Node.js,
Fastify, Vue 3, Vite, TypeScript, PostgreSQL, Playwright, docker compose and their dependencies.
**There was no code of our own.** The target repository's history begins on 2026-08-28
(`7f1ba50` — the MiniCRM app; `a287351` — its benchmark artifacts).

**Added during the competition:** everything else — the MiniCRM target, the case set, the ground
truth, the output schema, the harness and tooling, the baseline agent, the AAE ensemble, the
deterministic evaluator, this documentation, and the runs.

---

## 10. Safety, data and credentials

- **Synthetic target only.** MiniCRM is our own application with generated data; no third-party
  system is probed, and no real personal data exists anywhere in this repository.
- **Consequential actions are gated in the harness**, before execution — actions are classified by
  risk and destructive or out-of-scope ones are blocked or gated for approval by the harness, not
  requested of the model in a prompt
  ([`docs/07-safety.md`](docs/07-safety.md)).
- **Secrets stay out of the submission.** `.env` is gitignored; `.env.example` is committed. The
  one credential in the repository is MiniCRM's local demo login
  (`admin@minicrm.local` / `demo123`), deliberately committed because the target is a synthetic
  sandbox that judges run locally and a run without credentials is not reproducible. Both agents
  receive it through the same rendered task prompt, and `tooling/browser/network.ts` redacts it
  out of the recorded artifacts.
- **Human in the loop.** The system produces documentation for review, not changes to anyone's
  system; the reconstruction's confidence and evidence fields exist so a reviewer can see what a
  claim rests on rather than trust it.

---

## 11. Known limits

Stated here rather than left for a judge to find. Longer list in
[`docs/REPRODUCTION.md`](docs/REPRODUCTION.md) §11 and
[`docs/09-status-and-roadmap.md`](docs/09-status-and-roadmap.md) §2.

- **No runner.** Runs are launched one at a time, so the published pair is scored with `--all`
  against the full ground-truth corpus rather than as 15 per-case scores. Both systems are scored
  identically, so the comparison stands; what is lost is per-case resolution, not fairness. The
  15 cases exist (`miniCRM/benchmark/cases.json`) and per-case scoring works
  (`evaluate.mjs --case <id>`).
- **No scored ablation.** `AAE_ABLATE` switches are implemented and self-tested, but no ablation
  run was scored — each component's individual contribution is argued from design, not measured.
- **No B1 control point.** "The gain is architectural, not prompt engineering" is an argument
  (both systems share `config/task-prompt.md` byte for byte), not a measurement.
- **One pair, not a distribution.** Two runs, not repeated runs with variance.
- **Model deviation.** `config/run.default.json` pins `anthropic/claude-opus-4.6`, which has not
  been run by either system. The published pair both ran `openai/gpt-5.6-sol` under a local overlay;
  [`docs/REPRODUCTION.md`](docs/REPRODUCTION.md) §6 gives the exact overlay.
- **Not built:** the artifact generator (reconstruction JSON is not yet rendered into OpenAPI and
  prose) and the standalone Verifier role.

---

## 12. The four deliverables

| # | Deliverable | Where |
| --- | --- | --- |
| 01 | Complete solution code + Improvement Changelog | this repository · this README §6 · [`docs/06`](docs/06-baseline-and-changelog.md) |
| 02 | Reproduction guide | [`docs/REPRODUCTION.md`](docs/REPRODUCTION.md) |
| 03 | Solution video (≤ 5 min) | [`VIDEO-SCRIPT.md`](VIDEO-SCRIPT.md) |
| 04 | Agent trajectories | `results/runs/<run-id>/` — `trajectory.jsonl`, `evidence/`, `meta.json`, `summary.json`; AAE additionally `claims.jsonl`, `gaps.jsonl`, `pages.jsonl`, `assemble-log.json`, `prompts/` |

Rules-to-implementation matrix, including all ten ground rules:
[`docs/00-hackathon-requirements.md`](docs/00-hackathon-requirements.md).

---

## 13. Honesty discipline

Three rules this project held itself to, and the reason the numbers above can be checked rather
than believed:

1. **No result number appears without a link to a run directory.**
2. **Negative and removed results are recorded** — an iteration that made a metric worse is a
   changelog entry, not a deleted branch.
3. **No cherry-picking.** Both published runs are scored against the whole corpus, so no case
   selection took place; runs not chosen as the published pair are listed as history rather than
   deleted.
