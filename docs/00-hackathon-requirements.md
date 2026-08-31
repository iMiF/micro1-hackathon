# 00. Hackathon requirements and compliance matrix

> **Status:** frozen (the rules are external and cannot be changed, only clarified)
> **Updated:** 2026-08-31
> **Source of truth:** `micro1 - First Hackathon97ce7c5.pdf` (micro1 Agentic Workflows Hackathon brief)

This file is the single place where the rules live. Other documents link here instead of
restating them.

---

## 1. The organizers' challenge

> "Pick a specific and meaningful problem you understand. Use agents to solve it and show through
> clear evidence that your solution improves the way the task is handled today."

Four questions the brief asks us to keep in mind:

| # | Question | Where we answer it |
| --- | --- | --- |
| 01 | Who has this problem? | [`01-problem-and-value.md`](01-problem-and-value.md) §1 |
| 02 | What bottleneck makes it worth solving? | [`01-problem-and-value.md`](01-problem-and-value.md) §2 |
| 03 | Does the agent solve it well? | [`05-evaluation-and-metrics.md`](05-evaluation-and-metrics.md) |
| 04 | Can another person reproduce the result? | reproduction guide + [`04-benchmark-contract.md`](04-benchmark-contract.md) |

---

## 2. Judging rubric — 100 points

This is the most important table in the project. Work priorities are derived from it, not from
taste.

| Criterion | Points | What the brief counts as strong work | Our answer |
| --- | ---: | --- | --- |
| **Problem & User Value** | 15 | A meaningful problem for a clearly defined user | [`01`](01-problem-and-value.md) |
| **Agent Solution & Engineering** | 30 | Agents applied purposefully, solution technically sound. *Purposeful* choices (context, tools, memory, verification, skills, orchestration) matter, not their count | [`02`](02-architecture.md), [`06`](06-baseline-and-changelog.md) |
| **End to End Quality** | 20 | A realistic, self-contained run, a finished result "polished enough that a person would sign off on it," not an obvious AI draft | [`02`](02-architecture.md) §Artifact generator |
| **Measured Improvement** | 15 | A win over a fair baseline; the changelog connects every iteration to evidence | [`05`](05-evaluation-and-metrics.md), [`06`](06-baseline-and-changelog.md) |
| **Reproducibility** | 15 | Another person, from a clean environment, can walk to the main result | reproduction guide, [`04`](04-benchmark-contract.md) |
| **Hot Take / Insights** | 5 | An observed failure mode turned into a practical lesson | [`06`](06-baseline-and-changelog.md) §Hot take |
| **Total** | **100** | | |

**Consequences for planning.**

- The 30 points for Agent Solution are the largest block. Every AAE component must have a
  *named* failure mode it eliminates and an ablation run. A component without one is a minus,
  not a plus.
- The 20 points for End to End Quality are judged by the *finished artifact* (OpenAPI, docs), not
  by internals. That is separate work, not a byproduct of the pipeline.
- Measured Improvement (15) + Reproducibility (15) = 30 points depend on the benchmark
  infrastructure, not on the agent's cleverness. Hence the scope stop-rule in
  [`09`](09-status-and-roadmap.md).

---

## 3. Ground rules — 10 mandatory

| # | Rule (brief) | Our status | Where implemented |
| --- | --- | --- | --- |
| 01 | You may build on tools and components you already know | ✅ | Fastify/Vue/Playwright/Postgres |
| 02 | Clearly show what existed before the competition and what was added | ⚠️ written, not yet copied into the submission README (which is unwritten) | [`09`](09-status-and-roadmap.md) §1 |
| 03 | Use tools within their license and ToS | ✅ | all dependencies are OSS; the target is our own |
| 04 | Keep consequential actions in a sandbox/simulation, with human approval **before** the action | ⚠️ designed, not implemented | [`07`](07-safety.md) |
| 05 | A qualified human reviewer in the loop when a decision could materially affect someone | ⚠️ needs explicit wording | [`07`](07-safety.md) §Human control |
| 06 | Legal and ethical use case, responsible treatment of people and data | ✅ | target is synthetic, we don't probe others' systems |
| 07 | Data is public, synthetic, or approved anonymous data | ✅ | MiniCRM is fully synthetic |
| 08 | Credentials and private information are kept out of the submission | ⚠️ demo login `admin@minicrm.local` / `demo123` is in the repo | [`07`](07-safety.md) §Data |
| 09 | Every claim about a result is tied to submitted evidence | ⚠️ core discipline | [`08`](08-evidence-and-trajectories.md) |
| 10 | Give judges enough access to reproduce the main result | ✅ | [`REPRODUCTION.md`](REPRODUCTION.md) — three paths, the primary one needs no API key |

> **On rule 08.** The demo password for a local synthetic app is not a secret, but
> `LoginPage.vue` pre-fills the fields, which also runs against the spirit of the benchmark (it
> simplifies auth discovery). Recorded as open question OQ-3 in
> [`11`](11-decisions-and-open-questions.md).

---

## 4. Baseline requirements

The brief lists the acceptable forms of baseline:

- a single direct prompt with basic instructions;
- **a single general-purpose agent with basic tools**;
- a simple script or template;
- the manual process people use today.

And it requires: *"Keep the comparison fair by giving the baseline and final solution the same
task and evaluation cases. Explain any meaningful difference in the resources available to each
one."*

Our choice and its rationale — [`06-baseline-and-changelog.md`](06-baseline-and-changelog.md) §1.

---

## 5. Evaluation requirements

Verbatim from the brief:

- **A single primary metric** that reflects what success means for the user.
- Define what a good result looks like **before** the run.
- The same cases for baseline and final solution.
- Publish **complete** results.
- **Ten or more cases** is a good target, when the task allows it.
- **One hard case** is mandatory, with an explanation of what it revealed.
- Suggested table form: `Primary outcome`, `Human time per task`, `Cost per task`.
- *"You run this evaluation yourself. If the format above fits your task poorly, design your own
  clear scoring rubric and propose it, so the judges can use it to assess your workflow."*

The last point gives us the right to **replace** the standard form with our own rubric. We use
that right partially: we introduce our own primary metric ([`05`](05-evaluation-and-metrics.md),
ADR-2), but we still fill in the brief's table with human time and cost.

This is **our own** decision, stricter than the brief requires, not a requirement of the brief.
Rationale: a judge compares projects against each other, and a report form they already recognize
lowers the cost of understanding our metric.

---

## 6. Improvement Changelog

The brief requires a changelog telling the story from baseline to final:

- one entry per significant experiment;
- what was tried and **why**;
- the result, measured by the **same method**;
- decision: kept / redone / removed;
- **including experiments that were later removed**, and what they taught us.

Columns from the brief: `STAGE | WHAT YOU TRIED AND WHY | EVIDENCE | DECISION / LEARNING`.

Template — [`06-baseline-and-changelog.md`](06-baseline-and-changelog.md) §3.

---

## 7. Four mandatory deliverables

| # | Deliverable | Brief requirements | Our artifact | Status |
| --- | --- | --- | --- | --- |
| 01 | **Complete solution code + improvement changelog** | Full project and everything needed to run it, including **the instructions that shape each agent**. README introduces the user and their bottleneck, explains the value. A separate, clearly labeled Improvement Changelog. Ends with the main failure mode and hot take | repo + submission `README.md` + [`06`](06-baseline-and-changelog.md) | ⚠️ code, agent instructions (`config/task-prompt.md`, `agents/*/prompts`, `agents/baseline/system-prompt.md`), changelog, failure mode and hot take are all in place; **the root `README.md` is not written** |
| 02 | **Reproduction guide** | For a clean environment: setup, **exact commands** for solution / baseline / evaluation, what data is needed, what output to expect, versions, approximate time and cost | [`docs/REPRODUCTION.md`](REPRODUCTION.md) | ✅ done — versions, three command paths, expected output per artifact, measured time and cost, troubleshooting, and a named list of its own limits |
| 03 | **Solution video ≤ 5 minutes** | Problem → simple baseline → one realistic end-to-end run → final comparison → brief changelog → main contribution → one removed experiment | [`VIDEO-SCRIPT.md`](../VIDEO-SCRIPT.md) | ⚠️ scripted — 7 segments ≈ 4:50 covering every required beat, with a claim-to-file table; **not recorded** |
| 04 | **Agent trajectories** | Representative trajectories **for every agent used**: from instructions to result; what the agent did and how the tools responded; the feedback that shaped the next step; retries and human checkpoints | `results/runs/<run-id>/` | ⚠️ recorded for both systems (`trajectory.jsonl`, `evidence/`, `meta.json`; AAE also `claims.jsonl` / `gaps.jsonl` / `prompts/`), but `results/runs` is gitignored — **must be force-added before submission** |

> Deliverable 04 says "for every agent." We have two systems, and AAE orchestrates several roles
> internally. Each role's inputs and outputs are recorded per run: the Explorer in `trajectory.jsonl`,
> the Extractors in `prompts/` and `claims.jsonl`, the Inquisitor in `gaps.jsonl`, and the
> deterministic Assembler in `assemble-log.json`.

---

## 8. What the brief does not say

Recorded so we don't invent answers:

- **The brief itself states no deadline date**, but the organizers' schedule does: Aug 28 – Aug 31,
  2026, closing 11:00 AM – 2:00 PM America/Toronto. Recorded 2026-08-30, OQ-1 resolved; the plan in
  [`09`](09-status-and-roadmap.md) §4 is anchored to it.
- No constraints on language, stack, model, or budget.
- No requirement on video format or hosting platform.
- No ban on using pre-written code — there is a requirement to **label** it (rule 02).
