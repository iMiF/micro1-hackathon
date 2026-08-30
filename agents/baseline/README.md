# baseline

The simple baseline of ADR-3: one general-purpose LLM agent, the same seven tools, the same target,
the same output schema, the same budgets as AAE. Only the internal organization differs.

**Read this directory as the whole answer to "what does the baseline do?"** — that is its job
(ADR-10). It never imports from `agents/aae/`. Shared mechanics come from `tooling/`.

Its system prompt is the *honest minimal* one (ADR-11): the strongest single prompt a competent
engineer would write in an hour with no architecture — full tool descriptions, an explicit
instruction to explore thoroughly and not to invent. It is never weakened to widen the gap.

The task prompt — start URL, goal, output contract, epistemic rules, credentials, budgets — is not
authored here. It is benchmark input, identical for both systems (ADR-11, ADR-15).
