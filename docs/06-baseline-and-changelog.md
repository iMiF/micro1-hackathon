# 06. Baseline and Improvement Changelog

> **Status:** baseline scored — one run recorded; AAE iterations not started
> **Updated:** 2026-08-31
> **Source of truth:** brief §"Show how the solution improved", §"Tell the story with an improvement changelog"
> **Maps to criteria:** Measured Improvement (15), Hot Take (5), deliverable 01

---

## 1. Baseline choice and rationale

The brief offers four forms of baseline. Our choice is **"One general purpose agent with basic
tools."**

**Why not "a single direct prompt":** we're measuring the value of a *specialized agentic
workflow*, not the value of agency in general. If the baseline can't use a browser, the comparison
shows "an agent beats a non-agent" — a trivial, uninteresting result that also inflates our
apparent win.

**Why not "the manual process":** it would be a fair reference point for human time, but it can't
be run 15 times across 15 cases reproducibly.

**What this means in practice:** the baseline gets the **same** target, the **same** seven tools,
the **same** output schema, and the **same** budgets. Only the internal organization differs: it
has no coverage planner, no hypothesis ledger, no active experimentation, no risk classifier, and
no verifier.

This is deliberately a **strong** baseline. A weak baseline produces an impressive number and weak
work — the rubric asks directly, "Which changes truly improved the outcome?"

Full baseline description and its prompt — [`02-architecture.md`](02-architecture.md) §3.

### Resource differences

There are no planned differences. If any appear (for example, AAE making more tool calls within
the same budget), that is **recorded explicitly in the report** — a direct brief requirement.

---

## 2. Comparison method

- The same 15 cases from `miniCRM/benchmark/cases.json`.
- The same seeds.
- The same pinned target `application_commit`.
- The same model (when comparing the workflow rather than the model).
- Scoring by the deterministic evaluator, [`05`](05-evaluation-and-metrics.md).
- Every changelog iteration is measured by the **same** method.

---

## 3. Improvement Changelog

Column format is defined by the brief. Filled in as experiments are run.

> **Fill-in rule:** an entry is added when a run **has been performed**, not when the change was
> written. The EVIDENCE column contains a link to `artifacts/runs/<run-id>/`, not a description.
> Entries for removed experiments are **mandatory** — the brief requires them explicitly.

| STAGE | WHAT YOU TRIED AND WHY | EVIDENCE | DECISION / LEARNING |
| --- | --- | --- | --- |
| Baseline | General-purpose browser agent with seven tools and a shared instruction. Establishes a fair reference point on the same tool surface | `results/runs/baseline-2026-08-31T05-30-26-386Z/` (model `anthropic/claude-sonnet-5`, scope `all`, 179 tool actions, wall time 675s, cost $4.50) | **VARS(frozen) = 46.72** (pre-ADR-16: 44.70; rejected_balanced 56.68, rejected_flat 54.65). Same `reconstruction.json`, re-scored under the ADR-16 normal form. `operations` F1 = 1.00 (26/26), `parameters` F1 = 0.88 (25 tp / 2 fp / 5 fn), `dependencies` F1 = 0.625, `semantic_facts` F1 = 0.13 (6 tp / 15 fp / 65 fn — the dominant failure, matches the hypothesis in §4), `workflows` F1 = 0.10 (1/17, 2 fp; create-order now matches once trailing `refresh` is dropped). Hallucination rate 0.22, evidence support rate 1.00, coverage 1.00, submission valid. |
| Iteration 1 | _not started_ | | |
| Iteration 2 | _not started_ | | |
| Iteration 3 | _not started_ | | |
| Final | _not started_ | | |

> **Model deviation, recorded per §6:** `config/run.default.json` pins `model.id` to
> `anthropic/claude-opus-4.6` — no run against that model has been executed yet. The Baseline row
> above uses `anthropic/claude-sonnet-5`, selected from smoke-test runs across models
> (`config/run.local.json`, gitignored, does not feed the official scored run by its own comment).
> Pre-ADR-16 the recorded runs read `claude-haiku-4-5` 33.9, `claude-haiku-4.5` 24.0–36.7,
> `deepseek/deepseek-v4-pro` 0–40.4, `openai/gpt-5.6-sol` 36.0, `anthropic/claude-sonnet-5` 44.7
> (highest observed at the time). This entry substitutes the recorded sonnet smoke run for the
> not-yet-executed opus-4.6 run under deadline pressure; if an opus-4.6 run becomes available
> before submission it should replace this row rather than be added beside it, and the deviation
> note removed only once `run.default.json` and the recorded run agree.

The prompt grammar added in ADR-16 is **not** mixed into this figure: it will apply to later runs.
The 46.72 is what the already-submitted document scores under the fairer key.

### Planned iterations

The order is derived from which failure modes are expected to be the most costly. The order may
change — but every iteration must have a **named failure mode before the run**, otherwise it
becomes "we added a component because we could."

| # | What we add | Expected baseline failure mode | How we measure the effect |
| --- | --- | --- | --- |
| 1 | Coverage planner | Agent explores one section deeply and never gets to the rest; low recall on `operations` | Δ recall(operations), Δ coverage |
| 2 | Hypothesis ledger | A hypothesis is lost between steps; a single observation is submitted as a fact | Δ hallucination rate |
| 3 | Experiment planner | An enum value is named from a single observation; wrong tie to the UI label | Δ F1(semantic_facts) |
| 4 | Verifier | Plausible but unconfirmed claims in the final output | Δ precision, Δ evidence support rate |
| 5 | Artifact generator | Valid JSON that's useless to a human | human evaluation, doesn't affect VARS |

Every iteration gets an **ablation**: the whole system minus this component. Without an ablation
we can't claim the contribution is specifically its.

> **Note (2026-08-31):** the baseline's scored run put `operations` recall at 1.00 and `coverage`
> at 1.00, which leaves the coverage planner above with no failure mode left to recover — this
> table is expected to be revised before iteration 1 actually starts, against what was measured
> rather than what was guessed. That revision is AAE design work and is intentionally not in this
> commit.

### The prompt-vs-architecture ablation

The first question a judge asks about any improvement number is whether the gain came from the
architecture or from a better-written prompt. Answer it with a measurement, not an assertion, by
reporting three points instead of two:

| Point | What it is | What it isolates |
| --- | --- | --- |
| **B0** | Baseline, honest minimal prompt (ADR-11) | The floor |
| **B1** | Same single-agent loop, a deliberately stronger task-level prompt, no architecture | How much is reachable by prompt engineering alone |
| **AAE** | Full scaffolding | The architecture's own contribution, = AAE − B1 |

If B1 ≈ B0 and AAE is well above both, the improvement is architectural and the claim survives
scrutiny. If B1 captures most of the gap, that is worth knowing before the report is written, not
after a judge points it out. Cost: one extra run set — the most convincing chart in the submission
for the price of a third column.

---

## 4. Main failure mode

> Required by deliverable 01: "Close with the main failure mode and your hot take."

**Hypothesis before measurement** (recorded 2026-08-30, kept here unedited): the most costly issue
would not be missed operations but *confidently wrong semantics* — a plausible explanation of a
numeric value built on a single observation.

**What the run measured** (`baseline-2026-08-31T05-30-26-386Z`, re-scored under ADR-16): half
right, and the half it got wrong matters more. `semantic_facts` was indeed the worst category, and
precision there was 0.29 — confidently wrong semantics is real. But the dominant term is recall:
**0.08**. The agent submitted 21 facts where the corpus holds 71, 10 dependencies of 22, 3 workflows
of 17, and did so while scoring `coverage` 1.00, `operations` F1 1.00 and `evidence_support_rate`
1.00.

ADR-16 is the control for the obvious objection that this is a scoring artifact. It normalized every
notation variant these same reconstructions were losing on, and re-scoring the identical files moved
VARS 44.70 → 46.72. Under two points. What remains missing was never written down.

So the failure mode is not that the agent explored badly or reasoned badly. **It explored
completely and then wrote down a third of what it had seen.** The enum case is the clearest
instance: it produced one fact whose `meaning` string listed every value of an enum correctly,
where the corpus holds one fact per value — the knowledge was present and the accounting was not.

---

## 5. Hot take

> Filled in after the AAE runs. Hot Take / Insights criterion, 5 points.

The rubric asks us to turn an observed failure mode into a practical lesson for building reliable
agents. Not a general observation — a concrete conclusion that would change what we build next.

---

## 6. Honesty discipline

- No number in this file appears without a link to `artifacts/runs/<run-id>/`.
- Negative results get recorded. An iteration that made a metric worse is a changelog entry, not a
  deleted branch.
- A removed experiment is described together with what it taught us — the brief requires this
  explicitly.
- Cherry-picking cases is forbidden: all 15 are published.
