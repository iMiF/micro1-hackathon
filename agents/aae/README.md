# aae — Autonomous API Explorer

The evaluated system. Everything that makes it more than a loop lives here: planning by coverage
and information gain, the hypothesis ledger, active experiment design, re-verification, the
verifier, and synthesis into `semantic_facts`. Component list and the named failure mode each one
removes: `docs/02` §4; the ablation each one owes: `docs/06` §3.

Never imports from `agents/baseline/`. Shared mechanics come from `tooling/`.

Scaffolding prompts (planner, hypothesis, verifier, synthesis) are the implementation and are
expected to differ from the baseline's — that difference is the result being measured (ADR-11).
