# results

Run artifacts: trajectories, evidence, submissions, scores, and the experiment ledger.

The ledger records per case: score, wall time, cost, seed, model version. The report is filled in
from here and from nowhere else — no target figures standing in for measured ones (`docs/05` §8).

Shipped scored runs are listed in [`runs/INDEX.md`](runs/INDEX.md). Re-score them with Path A of
[`docs/REPRODUCTION.md`](../docs/REPRODUCTION.md). There is no `results:list` aggregator yet —
open `evaluation.json` in a run directory, or invoke `evaluator/bin/evaluate.mjs` on that
directory's `reconstruction.json`.
