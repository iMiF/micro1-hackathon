# aae

The evaluated system. Iteration 1 is the asymmetric ensemble of ADR-18: an
Explorer that never submits, deterministic TrafficMiner and DomainSweeper,
an Inquisitor that only invents a refutation experiment, per-section
Extractors, and a deterministic Assembler. Component list and the named
failure mode each one removes: `docs/02` §4; the ablation each one owes:
`docs/06` §3.

Never imports from `agents/baseline/` or `evaluator/`. Shared mechanics
come from `tooling/`. The seven tools and the task prompt are the same
objects the baseline uses (ADR-11). The `aae` block in
`config/run.default.json` only subdivides the granted budget (ADR-21).
Reasoning stays off (ADR-20).

```
npm run aae:selftest   # canonical keys, boards, miner/sweeper, digest, assembler, intercept, budget; no live target
npm run aae:run        # live MiniCRM; requires OPENROUTER_API_KEY
```

`AAE_FROM_EVIDENCE=<runDir>` skips the browser and runs miner / sweeper /
extractors / assembler over a recorded `evidence/evidence.jsonl`.
`AAE_REASSEMBLE_CLAIMS=<runDir>` skips extractors too and rebuilds
`reconstruction.json` from that run's `claims.jsonl` (no API key).
`AAE_ABLATE=miner,sweeper,inquisitor,extractors,verifier` turns named
components off for an ablation; with `extractors` ablated the Explorer
submits in the baseline manner.

The model id, temperature and `model.maxTokens` come from
`config/run.default.json`. Score separately — the agent does not call the
evaluator:

```
node evaluator/bin/evaluate.mjs --submission <runDir>/reconstruction.json --all --meta <runDir>/meta.json --out <runDir>
```
