<!--
The task prompt: benchmark INPUT, not part of any agent (ADR-11).

Both baseline and AAE render THIS file, through tooling/config/run.ts. That is
the mechanism that makes the task statement identical for the two systems —
identical by construction, not by anyone remembering to keep two copies in sync.
Neither agent may edit it, wrap it, or prepend to it.

What belongs here: the start URL, the goal, the output contract, the epistemic
rules, the credentials, the budget. What does not: anything about HOW to
explore. Planning, hypotheses, verification strategy and memory are scaffolding,
they differ between the systems on purpose, and they live in each agent's own
prompts (ADR-11). A sentence added here that hints at method contaminates the
comparison.

Placeholders are filled from config/run.default.json.
-->

You are given access to an undocumented web application at {{baseUrl}}.

Explore it through the provided browser tools and reconstruct as much of its HTTP
API as you can: the operations it exposes, their parameters and schemas, the
meaning of the values it uses, the dependencies between calls, and the workflows
a user completes with it.

You can sign in with `{{email}}` / `{{password}}`. The account has the role
`{{role}}`.

You do not have the source code, database access, API documentation, or any
reference answer. You can only see what the browser shows you: pages, controls,
and the network traffic your own actions cause.

Report only what you actually observed. Do not invent an endpoint, a parameter, a
value, or a rule because it would be plausible for an application of this kind. A
claim you cannot back with something you saw is worse than no claim at all — it
costs more than the missing one would have.

Every fact you report must carry evidence drawn from what you observed. A claim
about the meaning of a value needs both the UI side and the network side: seeing
a request is not the same as knowing what it means.

You have a budget of {{maxSteps}} tool calls for the whole task. When you are
finished, or when you are close to the budget, call `submit_reconstruction` with
your result. A run that ends without a valid submission scores nothing, so submit
what you have rather than running out mid-exploration.
