# Run index

Shipped scored runs. Scratch and failed attempts stay local (`results/runs/` is gitignored
except for the directories listed here). Re-score any row with Path A in
[`docs/REPRODUCTION.md`](../../docs/REPRODUCTION.md). There is no aggregator command yet
(`docs/09`); the per-run number lives in `evaluation.json`.

**Path A pair** (this submission's re-score target): sol baseline
`baseline-2026-08-31T14-45-38-777Z` (VARS 49.85) vs sol AAE
`aae-2026-08-31T14-51-18-382Z` (VARS 71.21). The luna pair is the same architecture on the
shipped default in `config/run.default.json`.

| Run | System | Model | maxSteps | VARS (frozen) | Actions | Wall | Cost | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| [`baseline-2026-08-31T14-45-38-777Z`](baseline-2026-08-31T14-45-38-777Z/) | baseline | `openai/gpt-5.6-sol` | 300 | **49.85** | 127 | 5m26s | $0.92 | Path A baseline |
| [`aae-2026-08-31T14-51-18-382Z`](aae-2026-08-31T14-51-18-382Z/) | aae | `openai/gpt-5.6-sol` | 300 | **71.21** | 264 | 18m12s | $3.32 | Path A AAE |
| [`baseline-2026-08-31T05-43-17-477Z`](baseline-2026-08-31T05-43-17-477Z/) | baseline | `openai/gpt-5.6-sol` | 300 | 51.20 | 133 | 5m35s | $1.05 | sol baseline repeat |
| [`baseline-2026-08-31T07-10-23-291Z`](baseline-2026-08-31T07-10-23-291Z/) | baseline | `openai/gpt-5.6-sol` | 300 | 49.58 | 121 | 4m33s | $0.98 | sol baseline repeat |
| [`aae-2026-08-31T13-48-48-550Z`](aae-2026-08-31T13-48-48-550Z/) | aae | `openai/gpt-5.6-sol` | 500 | 58.30 | 273 | 17m18s | $3.65 | sol AAE repeat (higher step cap) |
| [`baseline-2026-08-31T16-00-44-545Z`](baseline-2026-08-31T16-00-44-545Z/) | baseline | `openai/gpt-5.6-luna` | 200 | 33.56 | 69 | 3m42s | $0.05 | default-config baseline |
| [`aae-2026-08-31T16-04-43-124Z`](aae-2026-08-31T16-04-43-124Z/) | aae | `openai/gpt-5.6-luna` | 200 | 61.12 | 137 | 9m25s | $0.22 | default-config AAE |
| [`aae-2026-08-31T16-14-48-523Z`](aae-2026-08-31T16-14-48-523Z/) | aae | `openai/gpt-5.6-luna` | 300 | 62.35 | 216 | 13m31s | $0.31 | luna AAE repeat |

Every directory carries `reconstruction.json`, `evaluation.json`, `diff.json`, `meta.json`,
`summary.json`, `trajectory.jsonl` and `evidence/`. AAE directories also carry `claims.jsonl`,
`gaps.jsonl`, `pages.jsonl`, `digest.json`, `assemble-log.json` and `prompts/`.
