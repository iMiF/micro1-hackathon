# 06. Baseline and Improvement Changelog

> **Status:** draft (no runs yet — all entries are empty by construction)
> **Updated:** 2026-08-29
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
| Baseline | General-purpose browser agent with seven tools and a shared instruction. Establishes a fair reference point on the same tool surface | _run not performed_ | _—_ |
| Iteration 1 | _not started_ | | |
| Iteration 2 | _not started_ | | |
| Iteration 3 | _not started_ | | |
| Final | _not started_ | | |

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

---

## 4. Main failure mode

> Filled in after the runs. Required by deliverable 01: "Close with the main failure mode and your
> hot take."

Hypothesis before measurement (**not** a result): the most costly issue will not be missed
operations, but **confidently wrong semantics** — a plausible explanation of a numeric value built
on a single observation. This is a hypothesis the runs are meant to confirm or refute; if refuted,
the entry changes rather than being forced to fit.

---

## 5. Hot take

> Filled in after the runs. Hot Take / Insights criterion, 5 points.

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
