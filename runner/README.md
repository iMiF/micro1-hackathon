# runner

The experiment dispatcher, not an LLM and not an evaluator: Reset → Launch → Capture → Evaluate →
Aggregate (`docs/04` §6).

Reset order is not negotiable (ADR-4): stop the API → `db:reset` → start the API. Sessions live in
an in-process `Map`, so a reset that leaves the API running lets a session outlive it and runs stop
being independent. A run never restarts the API from inside itself.
