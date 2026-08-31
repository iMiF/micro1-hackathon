# Reproduction Guide

> **Status:** active
> **Updated:** 2026-08-31
> **Source of truth:** the repository itself (`package.json`, `config/run.default.json`,
> `evaluator/bin/evaluate.mjs`) and the scored runs listed in `results/runs/INDEX.md`
> **Maps to criteria:** Reproducibility (15), deliverable 02

This guide takes a judge from a clean machine to the headline number of this submission:

> **baseline VARS 49.85 → AAE VARS 71.21** (+21.37) on the shipped default `openai/gpt-5.6-sol`,
> same tool surface, same budget — at 3.6× the cost and 3.3× the wall time. The same architecture
> on the cheaper `openai/gpt-5.6-luna` moved 33.56 → 61.12 (+27.57); that pair is also in the
> repo (ADR-22).

There are three paths, in increasing order of effort. **Path A needs no API key, no Docker and no
network** and reproduces the headline number itself in about a minute, because scoring in this
project is deterministic. Paths B and C re-run the agents that produced the documents Path A scores.

| Path | What it proves | Needs | Time | Cost |
| --- | --- | --- | --- | --- |
| **A — re-score the shipped runs** | The two numbers above come out of a deterministic program, not out of a claim | Node 22 | ~2 min | $0 |
| **B — run the baseline yourself** | The baseline document is producible from the running target | + Docker, OpenRouter key | ~15 min | ~$0.92 |
| **C — run AAE yourself** | The AAE document is producible from the running target | + Docker, OpenRouter key | ~25 min | ~$3.32 |

---

## 1. Versions and prerequisites

| Component | Version | Checked by |
| --- | --- | --- |
| Node.js | **≥ 22** (developed on 22.23.2) | `node -v`; `engines` in `package.json`, `miniCRM/package.json`, `evaluator/package.json` |
| npm | 10.x (10.9.8) | `npm -v` |
| Docker + Compose | any current version | `docker --version`; PostgreSQL 17 comes from `miniCRM/docker-compose.yml` |
| Playwright browser | Chromium, playwright 1.50.1 | installed in step 2.3 |
| OpenRouter API key | any account with credit | Paths B and C only |

Node 22 is a hard requirement, not a preference: the repo reads `.env` with the built-in
`process.loadEnvFile` (`tooling/config/env.ts`) instead of taking a `dotenv` dependency.

Everything the agents talk to is local except the model API. No other external service is contacted
(`docs/07` §4).

---

## 2. Setup from a clean checkout

### 2.1 Install the workspace

```bash
npm install                     # repo root: playwright, ajv, the Anthropic SDK, tsx
cd evaluator && npm install     # the evaluator is standalone: ajv only
cd ..
```

### 2.2 Credentials

```bash
cp .env.example .env
# edit .env and set OPENROUTER_API_KEY=sk-or-...
```

`.env` is gitignored and is the only file in the repo that should ever hold a real secret. A key
already exported in your shell wins over the file. **Path A does not need this step.**

MiniCRM's demo login (`admin@minicrm.local` / `demo123`) is *deliberately committed* in
`config/run.default.json`: the target is a synthetic sandbox that judges are expected to run
locally, and a run is not reproducible if its credentials are missing. Both agents receive them
through the same rendered task prompt, and `tooling/browser/network.ts` redacts them out of the
recorded artifacts.

### 2.3 Browser

```bash
npx playwright install chromium
```

The harness drives Chromium headless (`tooling/browser/driver.ts`). Set `HEADED=1` to watch a run.

### 2.4 Start the target

```bash
cd miniCRM
npm install
docker compose up -d --wait     # PostgreSQL 17 on 127.0.0.1:15432 (not 5432)
npm run db:reset                # drops app data, migrates, restores the deterministic seed
npm run dev                     # web on :5173, API on :3000
```

Leave this running in its own terminal and check `http://localhost:5173` in a browser before
starting an agent. **Path A does not need this step either.**

> **Reset discipline (ADR-4).** Before each *scored* run, reset in this order: stop the API →
> `npm run db:reset` → start the API. Sessions live in an in-process `Map`
> (`miniCRM/apps/api/src/session.ts`), so a DB reset alone leaves a stale session valid and the runs
> are no longer independent.

---

## 3. Path A — reproduce the headline numbers without running an agent

Scoring is a deterministic program: no LLM, no embeddings, no fuzzy matching, no network anywhere in
`evaluator/` (`docs/05` §7). The same submission always yields the same score, on any machine. So
the comparison itself can be re-derived from the shipped artifacts:

```bash
# baseline
node evaluator/bin/evaluate.mjs \
  --submission results/runs/baseline-2026-08-31T14-45-38-777Z/reconstruction.json \
  --meta       results/runs/baseline-2026-08-31T14-45-38-777Z/meta.json \
  --all --out /tmp/score-baseline

# AAE
node evaluator/bin/evaluate.mjs \
  --submission results/runs/aae-2026-08-31T14-51-18-382Z/reconstruction.json \
  --meta       results/runs/aae-2026-08-31T14-51-18-382Z/meta.json \
  --all --out /tmp/score-aae
```

Expected — identical to the `evaluation.json` already committed inside each run directory:

| | baseline | AAE | Δ |
| --- | --- | --- | --- |
| **VARS (frozen)** | **49.85** | **71.21** | **+21.37** |
| VARS (rejected_balanced) | 59.70 | 78.18 | +18.48 |
| VARS (rejected_flat) | 59.14 | 79.00 | +19.86 |
| operations F1 | 0.94 | 1.00 | |
| parameters F1 | 0.91 | 0.93 | |
| semantic_facts F1 | 0.14 (recall 0.08) | 0.43 (recall 0.30) | |
| dependencies F1 | 0.53 | 0.68 | |
| workflows F1 | 0.43 | 0.91 | |
| hallucination rate | 0.12 | 0.18 | |
| evidence support rate | 1.00 | 1.00 | |
| coverage | 1.00 | 1.00 | |
| tool actions | 127 | 264 | 2.1× |
| wall time | 5m26s | 18m12s | 3.3× |
| cost | $0.92 | $3.32 | 3.6× |

Both runs are `openai/gpt-5.6-sol`, `temperature 0`, `maxSteps` 300, `wallClockMs` 900000,
`maxTokens` 32000, scored with `--all` — a run of `config/run.default.json` with no model overlay
(ADR-22).

**Same architecture on the cheaper `openai/gpt-5.6-luna`** (replication, `maxSteps` 200):
baseline `results/runs/baseline-2026-08-31T16-00-44-545Z/` VARS 33.56 / $0.05 vs AAE
`results/runs/aae-2026-08-31T16-04-43-124Z/` VARS 61.12 / $0.22 (+27.57). The sign and the
categories of the gain are the same; luna is weaker and ~15× cheaper. Repeats of both models are
listed in `results/runs/INDEX.md`.

**The ranking is the same under all three weight vectors.** Every invocation of the evaluator prints
all three side by side, whichever one is active — this is the standing obligation from ADR-13, and it
is the reason the improvement cannot be an artifact of a weight vector chosen after the fact.

### Verify the evaluator itself

```bash
cd evaluator && npm test        # 20 golden tests, including the 7 mandatory ones from docs/05 §7
```

The strongest single check is the perfect-reconstruction fixture: the reference document written by
hand from ground truth must score exactly 100 under all three vectors.

```bash
node evaluator/bin/evaluate.mjs \
  --submission miniCRM/benchmark/examples/perfect-reconstruction.json --all
# VARS 100 under frozen, rejected_balanced and rejected_flat
```

### Static checks

```bash
npm run typecheck
npm run harness:selftest        # normalizer, policy gate, tool schemas — no target needed
npm run baseline:selftest
npm run aae:selftest
```

---

## 4. Path B — reproduce a baseline run

With the target up (§2.4) and `.env` filled in:

```bash
npm run baseline:run
```

It prints the target, model, budget and the run directory, then writes to
`results/runs/baseline-<utc-timestamp>/` and finishes by printing the exact `evaluate.mjs` command
for that directory. Run it:

```bash
node evaluator/bin/evaluate.mjs \
  --submission results/runs/baseline-<ts>/reconstruction.json \
  --meta       results/runs/baseline-<ts>/meta.json \
  --all --out  results/runs/baseline-<ts>
```

**What you get** in the run directory:

| File | What it is |
| --- | --- |
| `reconstruction.json` | The submission — the only thing that is scored |
| `trajectory.jsonl` | Every step: tool call, arguments, policy decision, result |
| `evidence/evidence.jsonl` | Every observation the document may cite: UI actions, network events, policy decisions |
| `screenshots/` | Captured frames, when the agent took any |
| `meta.json` | The run ledger: model, budgets, isolation deny-list, tokens, cost, wall time, tool actions |
| `summary.json` | Step and evidence counts, and the list of operations actually observed |
| `evaluation.json`, `diff.json` | Written by the evaluator: scores, and matched / missing / spurious / invalid per category |

`diff.json` is the file to open if you want to see *why* a score is what it is — it names each
credited and each missed fact.

---

## 5. Path C — reproduce an AAE run

```bash
npm run aae:run
```

Same contract, same budgets, same seven tools, same output schema; the run directory is
`results/runs/aae-<ts>/` and carries the same files as above plus AAE's internal ledger:
`claims.jsonl`, `gaps.jsonl`, `pages.jsonl`, `digest.json`, `assemble-log.json`, `prompts/`. Score it
exactly as in Path B.

Two environment switches exist for inspection and ablation; neither is used in a scored run:

| Variable | Effect |
| --- | --- |
| `AAE_ABLATE=miner,sweeper,...` | Disable named components; the disabled list is recorded in `meta.json` as `ablated` |
| `AAE_FROM_EVIDENCE=<dir>` | Re-run extraction and assembly over an already recorded evidence directory, without touching the target |

---

## 6. Reproducing the exact scored pair

`config/run.default.json` is the shared contract — **both systems read this one file**, and any field
that differed between them would be a fairness violation. It pins `openai/gpt-5.6-sol`,
`maxSteps 300`, `maxCostUsd 10` (ADR-22). The published pair in §3 uses that `model.id` and
`maxSteps`. Neither run spent more than $3.32, so the cap did not bind — and ADR-21 already
exempts `maxCostUsd` from the fairness contract, because it stops a run rather than shaping it.

To reproduce it: §2.4's reset, `npm run baseline:run`, reset again, `npm run aae:run`, and score
both with `--all`. `MINICRM_URL`, `AAE_EMAIL` and `AAE_PASSWORD` override the target and
credentials on top of that, for pointing the harness at something that is not the local sandbox.

**The luna replication** (33.56 → 61.12) was not run under those defaults. Reproduce it with a
gitignored `config/run.local.json` overlay, deep-merged over the defaults by
`tooling/config/run.ts → loadRunConfig`:

```json
{
  "model": { "id": "openai/gpt-5.6-luna", "temperature": 0 },
  "budgets": { "maxSteps": 200, "wallClockMs": 900000, "maxCostUsd": 10 }
}
```

That overlay is how to reproduce the luna pair, not how to reproduce the headline numbers. Sol is
the default because it is the model a judge hits without an overlay, and because the architecture's
delta does not depend on which of the two was used.

---

## 7. What will and will not come out the same

**Bit-identical, every time, on any machine:** everything after `reconstruction.json`. Scoring is a
pure function of the submission and the ground truth. Re-scoring our shipped runs (Path A) is
therefore an exact reproduction, not an approximation.

**Not identical:** the runs themselves. Both agents are LLM-driven, and `temperature 0` does not make
a hosted model deterministic — provider-side batching, model revisions and tie-breaking all move the
trajectory. Expect a different path through the UI, a different action count, and a VARS figure
within a few points of ours rather than exactly ours. What should reproduce is the **ordering and its
rough size**: AAE well above the baseline, driven mostly by `semantic_facts` and `workflows`, and
paying for it in time and money.

Also expect to vary:

- **Cost.** Estimated from OpenRouter's published per-token prices at run time
  (`tooling/llm/client.ts → estimateCostUsd`), so a price change moves the figure. If you point
  `run.local.json` at a model OpenRouter does not list, the estimate throws *after* the run — the
  artifacts are already on disk at that point.
- **Wall time.** Dominated by model latency, not by the harness.
- **`application_commit`.** The ledger field exists for pinning the target version; the shipped runs
  were produced from this working tree and do not carry it.

---

## 8. Checks a judge can run against our fairness claims

These are mechanical, not promises:

- **Both systems get the same contract.** `agents/baseline/run.ts` and `agents/aae/run.ts` both call
  `loadRunConfig` on the same file, and both build the harness from `config.budgets` and
  `config.policy`. `meta.json` in each run directory records what was actually in force.
- **The agent cannot see the answers.** `config/run.default.json → isolation.deny` lists
  `miniCRM/benchmark/ground-truth`, `miniCRM/benchmark/cases.json`, the perfect reconstruction,
  `miniCRM/apps`, `miniCRM/db` and `docs/`. `tooling/isolation/context.ts` enforces it when the agent
  context is assembled — `npm run baseline:selftest` exercises that check. The only channels into an
  agent are the rendered task prompt, the public output schema and the harness's own observations.
- **The step budget is enforced outside the prompt.** `maxSteps` is counted by the harness, so it
  cannot be talked around.
- **Every scored claim carries evidence.** `evidence_support_rate` is 1.00 in both Path A runs, and the
  evidence ids in `reconstruction.json` resolve into `evidence/evidence.jsonl`.

---

## 9. Time and cost, measured

| Step | Time | Cost |
| --- | --- | --- |
| `npm install` (root, miniCRM, evaluator) | 2–4 min | — |
| `docker compose up -d --wait` (first pull of PostgreSQL 17) | 1–3 min | — |
| `npx playwright install chromium` | ~1 min | — |
| `npm run db:reset` | seconds | — |
| Path A: re-score both runs + evaluator test suite | < 2 min | $0 |
| Path B: one baseline run | ~6 min (ours: 5m26s / 127 actions) | ~$0.92 |
| Path C: one AAE run | ~20 min (ours: 18m12s / 264 actions) | ~$3.32 |
| Path B under luna overlay | 3–5 min (ours: 3m42s / 69 actions) | ~$0.05 |
| Path C under luna overlay | 8–12 min (ours: 9m25s / 137 actions) | ~$0.22 |

Budget roughly **$5 and 40 minutes** to walk the whole guide including both live sol runs, or
about **$1 and 30 minutes** on the luna overlay, and about **five minutes and nothing** to verify
the headline claim by re-scoring what ships in the repo.

`maxCostUsd` in the run config is a hard per-run spend guard checked before every model call — lower
it if you want a cheaper look; the run will stop early rather than overspend.

---

## 10. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `OPENROUTER_API_KEY is not set` | `cp .env.example .env` and fill it in, or export the key. Not needed for Path A or the selftests. |
| Agent starts but every page is blank | The target is not up. `npm run dev` inside `miniCRM/`, then open `http://localhost:5173`. |
| API errors right after a reset | The API process outlived the reset. Stop it, `npm run db:reset`, start it again (ADR-4). |
| `password authentication failed` / `Database authentication failed on 127.0.0.1:15432` | Node is talking to a Postgres that is not the MiniCRM container. The API defaults to `127.0.0.1:15432` (see `miniCRM/docker-compose.yml`), not 5432. Check `docker compose ps` and that nothing else owns 15432; do not point `DATABASE_URL` at a local Homebrew/Postgres.app instance. |
| `Bind for 127.0.0.1:15432 failed: port is already allocated` | Something else is on 15432. Stop it, or set `DATABASE_URL` and the compose host port to a free port together. |
| `estimateCostUsd` throws after a run finished | The model id in `config/run.local.json` is not in OpenRouter's price list. The run artifacts are already written; score them as normal. |
| Playwright cannot find a browser | `npx playwright install chromium` at the repo root. |
| Scores differ from §3 when re-scoring our runs | They should not — that path is deterministic. Check you passed `--all` (not `--case`) and that `evaluator/config/weights.json` is unmodified. |

---

## 11. Known limits of this guide

Stated plainly, because a reproduction guide that hides its gaps is worth less than one that names
them:

- **No runner yet.** There is no single command that runs all 15 benchmark cases across both systems
  and aggregates them. The scored pair was therefore produced with `--all` — the full ground-truth
  corpus — not as 15 per-case scores. `--case <id>` scoring works today
  (`node evaluator/bin/evaluate.mjs --submission ... --case case-09-create-order-workflow`) and the
  15 case ids are in `miniCRM/benchmark/cases.json`; what is missing is the orchestration around it.
- **The default model is the stronger one.** `config/run.default.json` pins `openai/gpt-5.6-sol`
  (ADR-22) at `maxSteps` 300. Path A re-scores that pair. A live run with no overlay produces sol,
  matching the headline numbers in family if not bit-identically. Luna scores lower; the
  architecture's delta does not. Repeats of both models are in `results/runs/INDEX.md`.
- **The B1 point is not measured.** The prompt-vs-architecture ablation described in
  [`06`](06-baseline-and-changelog.md) §3 has a design but no run, so "the gain is architectural,
  not prompt engineering" is currently an argument, not a measurement.
- **Few repeats, not a distribution.** Several finished runs per model are shipped, but this is
  not a measured variance estimate.

---

## Related documents

- [`04-benchmark-contract.md`](04-benchmark-contract.md) — cases, output schema, fairness rules
- [`05-evaluation-and-metrics.md`](05-evaluation-and-metrics.md) — VARS, the five-step scoring
  algorithm, secondary metrics
- [`06-baseline-and-changelog.md`](06-baseline-and-changelog.md) — baseline choice and the
  Improvement Changelog
- [`07-safety.md`](07-safety.md) — risk policy, human control, data handling
- [`08-evidence-and-trajectories.md`](08-evidence-and-trajectories.md) — what a run must record
- [`03-target-minicrm.md`](03-target-minicrm.md) — the target application and its real API surface
