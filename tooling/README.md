# tooling

Mechanics shared by both agents: the browser driver, evidence capture, and deterministic
serialization/validation of the submission.

> Boundary (ADR-10): `tooling/` executes and records, it never decides. Code that chooses the next action or classifies what an observation means belongs in `agents/aae/`.

Concretely, what belongs here: executing a tool call, normalizing an observation into the contract
of `docs/02` §2, recording an `ev_NNN` entry, validating a submission against
`miniCRM/benchmark/schemas/reconstruction-output.schema.json`, assigning ids, de-duplicating, and
retrying an invalid submission an equal number of times for both systems (ADR-12).

What does not belong here: interpreting an observation, choosing a `kind`, mapping free text into
the schema, or an adaptive retry policy — that last one is a strategy, not infrastructure.
