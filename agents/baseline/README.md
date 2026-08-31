# baseline

The simple baseline of ADR-3: one general-purpose LLM agent, the same seven tools, the same target,
the same output schema, the same budgets as AAE. Only the internal organization differs.

**Read this directory as the whole answer to "what does the baseline do?"** — that is its job
(ADR-10). It never imports from `agents/aae/`. Shared mechanics come from `tooling/`.

Its system prompt is the *honest minimal* one (ADR-11): the strongest single prompt a competent
engineer would write in an hour with no architecture — full tool descriptions, an explicit
instruction to explore thoroughly and not to invent. It is never weakened to widen the gap.

The task prompt — start URL, goal, output contract, epistemic rules, credentials, budgets — is not
authored here. It is benchmark input, identical for both systems (ADR-11, ADR-15), rendered by
`tooling/config/run.ts`.

```
npm run baseline:selftest   # isolation, prompt wiring, no live target
npm run baseline:run        # live MiniCRM; requires OPENROUTER_API_KEY
```

The model id, temperature and per-call output ceiling (`model.maxTokens`) come from
`config/run.default.json`, not from this directory. Every `submit_reconstruction` call logs its
argument size, nested document size, sibling-text size and the response `stop_reason` — that line is
how you tell a generation truncated at `maxTokens` from a model that cannot fill a free-form object
argument (ADR-17).
`OPENROUTER_API_KEY` is read from the environment; the simplest way to set it is:

```
cp .env.example .env   # once, at repo root
# then put your key on the OPENROUTER_API_KEY= line in .env
```

`.env` is gitignored, so it never gets committed — `loadDotEnv()` (`tooling/config/env.ts`)
reads it at the start of `baseline:run`. Exporting the variable in the shell instead still works
and takes priority if both are set.

`baseline:run` writes `results/runs/baseline-<utc>/` (the `runDir` the harness receives). Score
separately — the agent does not call the evaluator:

```
node evaluator/bin/evaluate.mjs --submission <runDir>/reconstruction.json --all --meta <runDir>/meta.json --out <runDir>
```
