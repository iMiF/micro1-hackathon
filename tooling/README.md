# tooling

Mechanics shared by both agents: the browser driver, evidence capture, and deterministic
serialization/validation of the submission.

> Boundary (ADR-10): `tooling/` executes and records, it never decides. Code that chooses the next action or classifies what an observation means belongs in `agents/aae/`.

Concretely, what belongs here: executing a tool call, normalizing an observation into the contract
of `docs/02` §2, recording an `ev_NNN` entry, validating a submission against
`miniCRM/benchmark/schemas/reconstruction-output.schema.json`, assigning ids, de-duplicating,
retrying an invalid submission an equal number of times for both systems (ADR-12), recovering a
submission the model emitted in the wrong channel or cut off mid-generation (ADR-17,
`reconstruction/recover.ts` — structural repair only, it never chooses a `kind` or invents a fact),
estimating run cost from OpenRouter's live model catalog (`llm/client.ts` — list prices, not a
decision about which model to call), and marking prompt-cache breakpoints on Anthropic models
(`llm/client.ts` `supportsPromptCaching`/`enableCaching` — mechanical eligibility check on the model
id, not a strategy choice; each agent tree still decides for itself whether to pass `enableCaching`
and how to react to its own running cost, since `agents/baseline/` and `agents/aae/` do not share a
loop).

What does not belong here: interpreting an observation, choosing a `kind`, mapping free text into
the schema, or an adaptive retry policy — that last one is a strategy, not infrastructure.
