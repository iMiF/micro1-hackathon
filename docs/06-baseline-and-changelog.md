# 06. Baseline and Improvement Changelog

> **Status:** baseline and AAE iteration 1 both scored; the comparison is published
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

- The same 15 cases from `miniCRM/benchmark/cases.json`. **Deviation, recorded rather than smoothed
  over:** no runner was built, so the published pair is scored with `--all` against the full
  ground-truth corpus instead of as 15 per-case scores. Both systems are scored the identical way, so
  the comparison stands; what is lost is per-case resolution, not fairness. Per-case scoring itself
  works today (`evaluate.mjs --case <id>`).
- The same seeds.
- The same pinned target `application_commit`.
- The same model (when comparing the workflow rather than the model).
- Scoring by the deterministic evaluator, [`05`](05-evaluation-and-metrics.md).
- Every changelog iteration is measured by the **same** method.

---

## 3. Improvement Changelog

Column format is defined by the brief. Filled in as experiments are run.

> **Fill-in rule:** an entry is added when a run **has been performed**, not when the change was
> written. The EVIDENCE column contains a link to a directory under `results/runs/`, not a description.
> Entries for removed experiments are **mandatory** — the brief requires them explicitly.

| STAGE | WHAT YOU TRIED AND WHY | EVIDENCE | DECISION / LEARNING |
| --- | --- | --- | --- |
| Baseline (first scored run, history) | General-purpose browser agent with seven tools and a shared instruction. Establishes a fair reference point on the same tool surface | `results/runs/baseline-2026-08-31T05-30-26-386Z/` (model `anthropic/claude-sonnet-5`, scope `all`, 179 tool actions, wall time 675s, cost $4.50) | **VARS(frozen) = 46.72** (pre-ADR-16: 44.70; rejected_balanced 56.68, rejected_flat 54.65). Same `reconstruction.json`, re-scored under the ADR-16 normal form. `operations` F1 = 1.00 (26/26), `parameters` F1 = 0.88 (25 tp / 2 fp / 5 fn), `dependencies` F1 = 0.625, `semantic_facts` F1 = 0.13 (6 tp / 15 fp / 65 fn — the dominant failure, matches the hypothesis in §4), `workflows` F1 = 0.10 (1/17, 2 fp; create-order now matches once trailing `refresh` is dropped). Hallucination rate 0.22, evidence support rate 1.00, coverage 1.00, submission valid. |
| Replication — baseline on `gpt-5.6-sol` | The same baseline agent on a stronger, more expensive model, at `maxSteps` 300. Kept so the architecture's delta can be read across models, not only on the default (ADR-22) | `results/runs/baseline-2026-08-31T14-45-38-777Z/` (127 tool actions of 300, 5m26s, $0.92, scope `all`) | **VARS(frozen) = 49.85** (rejected_balanced 59.70, rejected_flat 59.14). `operations` F1 0.94, `parameters` 0.91, `dependencies` 0.53, `workflows` 0.43, `semantic_facts` 0.14 (precision 0.43, **recall 0.08**). Hallucination 0.12, evidence support 1.00, coverage 1.00. Same shape as the sonnet run: complete exploration, one-third of it written down |
| Replication — iteration 1 on `gpt-5.6-sol` | The ADR-18 ensemble on the same sol contract as the row above | `results/runs/aae-2026-08-31T14-51-18-382Z/` (264 tool actions of 300, 18m12s, $3.32, same seven tools, scope `all`) | **VARS(frozen) = 71.21** (rejected_balanced 78.18, rejected_flat 79.00) — **+21.37 over the sol baseline, ranking holds under all three weight vectors**. Synthesis categories: `workflows` 0.43 → 0.91, `semantic_facts` 0.14 → 0.43 (recall 0.08 → 0.30), `dependencies` 0.53 → 0.68, `operations` 0.94 → 1.00. Resource difference: 2.1× actions, 3.3× wall time, 3.6× cost. **Not the published pair** — sol is ~15× the luna pair's spend, and this run used an overlay of `maxSteps` 300 rather than the shipped 200 |
| **Baseline (published pair)** | The same baseline agent, unchanged, on the default model `openai/gpt-5.6-luna` at the shipped `maxSteps` 200 (ADR-22) | `results/runs/baseline-2026-08-31T16-00-44-545Z/` (69 tool actions of 200, 3m42s, $0.05, scope `all`) | **VARS(frozen) = 33.56** (rejected_balanced 41.68, rejected_flat 39.11). `operations` F1 0.84, `parameters` 0.54, `dependencies` 0.36, `workflows` 0.10, `semantic_facts` 0.12 (precision 0.45, **recall 0.07**). Hallucination 0.20, evidence support 1.00, coverage 1.00. Weaker absolute score than sol — and the same synthesis hole: `semantic_facts` recall 0.07 |
| **Iteration 1 — asymmetric ensemble (ADR-18)** | Split the single loop into roles that cannot be confused with each other: an Explorer that explores and **never submits**, deterministic TrafficMiner and DomainSweeper passes over the recorded traffic, an Inquisitor that only proposes refutation experiments, per-section LLM Extractors run in parallel, and a deterministic Assembler that calls `submit_reconstruction` itself. Why this and not more exploration: the baseline's own numbers named the failure mode as synthesis, not coverage (§4) | `results/runs/aae-2026-08-31T16-04-43-124Z/` (137 tool actions of 200, 9m25s, $0.22, same model, same budget, same seven tools, scope `all`) | **VARS(frozen) = 61.12** (rejected_balanced 67.49, rejected_flat 68.33) — **+27.57 over the paired luna baseline, and the ranking holds under all three weight vectors**. The movement is concentrated where the failure mode was: `workflows` F1 0.10 → 0.61, `semantic_facts` 0.12 → 0.29 (recall 0.07 → 0.20), `dependencies` 0.36 → 0.81, `operations` 0.84 → 0.96. **Kept as the published pair.** Resource difference, as the brief requires it be named: 2.0× the tool actions, 2.5× the wall time, 4.4× the cost. Hallucination 0.20 → 0.24 |
| **Removed — coverage planner** | The pre-measurement design had a component whose job was to make sure the agent reached every operation. It was **cut before a line of it was written** | The baseline run that killed it: `results/runs/baseline-2026-08-31T05-30-26-386Z/` (`operations` F1 1.00, `coverage` 1.00) | **Removed.** There was no failure mode left for it to eliminate — the plain agent already reached everything. The lesson, and the reason this row exists: a component earns its place by the failure mode it removes **in a measurement**, not by how reasonable it looks in an architecture diagram. This is what redirected iteration 1 from exploration to synthesis |
| Iteration 2 (reasoning, ADR-20) | _not started_ | | Requires a control point B2 so the gain can be attributed to reasoning rather than asserted |
| Iteration 3 (verifier) | _not started_ | | `verifier.enabled` is `false` in `config/run.default.json`; the switch exists, the component does not |
| Ablation set | _not started_ | | `AAE_ABLATE=miner,sweeper,inquisitor,extractors` is implemented and self-tested, but no ablation run is scored — so each component's individual contribution is argued from design, not measured |
| **Final** | = Iteration 1 on luna. No further iteration was run before the deadline | the two luna run directories above | **33.56 → 61.12 VARS(frozen)** on the shipped default (`openai/gpt-5.6-luna`, `maxSteps` 200), one budget, one contract, three weight vectors, both trajectories published. The sol replication (49.85 → 71.21) is the check that this delta is not a cheap-model artifact (ADR-22) |

> **Model, recorded per ADR-22:** `config/run.default.json` pins `model.id` to `openai/gpt-5.6-luna`,
> and the published pair above uses that `model.id` and the shipped `maxSteps` 200. The ledger
> records `maxCostUsd` 10 from a local overlay; neither run spent more than $0.22, so the cap did
> not bind (ADR-21 exempts it). Luna is worse in absolute VARS
> than sol on both systems (33.56 vs 49.85 baseline; 61.12 vs 71.21 AAE) and ~15× cheaper for the
> pair ($0.27 vs $4.24). It is the default because a judge who follows
> [`REPRODUCTION.md`](REPRODUCTION.md) without an overlay should hit the numbers this submission
> claims, and because the architecture's delta (+27.57 luna, +21.37 sol) does not depend on which
> of the two was used. The sol pair is a replication at `maxSteps` 300, labeled as such, not
> silently dropped. The first Baseline row uses `anthropic/claude-sonnet-5` and is kept as history.
> Pre-ADR-16 smoke runs read `claude-haiku-4-5` 33.9, `claude-haiku-4.5` 24.0–36.7,
> `deepseek/deepseek-v4-pro` 0–40.4, `openai/gpt-5.6-sol` 36.0, `anthropic/claude-sonnet-5` 44.7
> (highest observed at the time). A second luna AAE run at `maxSteps` 300
> (`aae-2026-08-31T16-14-48-523Z`, VARS 62.35) is not published: there is no matching luna baseline
> at that budget (ADR-21).

The prompt grammar added in ADR-16 is **not** mixed into this figure: it will apply to later runs.
The 46.72 is what the already-submitted document scores under the fairer key.

### Planned iterations

The order is derived from which failure modes are expected to be the most costly. The order may
change — but every iteration must have a **named failure mode before the run**, otherwise it
becomes "we added a component because we could."

**Status of this plan as of 2026-08-31:** it was written before the baseline was measured, and the
measurement rewrote it. Row 1 was removed unimplemented; rows 2 and 3 were merged into the ADR-18
ensemble and shipped as iteration 1; rows 4 and 5 are unbuilt. It is kept unedited below because the
distance between what was planned and what the measurement demanded is itself the finding.

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

**Not measured.** B1 was never run — the time went into iteration 1 itself. So "the gain is
architectural, not prompt engineering" is currently an argument, not a measurement, and it is listed
that way in [`09`](09-status-and-roadmap.md) §2 and in [`REPRODUCTION.md`](REPRODUCTION.md) §11. The
argument, for what it is worth: the baseline and AAE share `config/task-prompt.md` byte for byte
(ADR-11), so no task-level prompt engineering separates them; what differs is who is asked to do
what, and when. That is testable in one extra run set, and the run set was not made.

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

> Hot Take / Insights criterion, 5 points. Written from the two runs in §3, not from intuition.

**The bottleneck of an exploration agent is not exploration. It is writing down what it already
saw.**

On the published luna pair the baseline scored `coverage` 1.00 and still submitted a fraction of
what a reconstruction needs: `semantic_facts` recall 0.07, `workflows` F1 0.10, `dependencies`
0.36. Iteration 1 changed **who writes**: the Explorer lost the ability to submit at all, and a
separate set of per-section Extractors reads the recorded evidence with one job each. That moved
**27.6 VARS** (33.56 → 61.12), concentrated in the synthesis categories, at 2.0× the actions.

The same split, on the stronger and more expensive `gpt-5.6-sol`, moved **21.4 VARS** (49.85 →
71.21) with the same shape (`workflows` 0.43 → 0.91, `semantic_facts` recall 0.08 → 0.30). Luna is
worse in absolute terms; the architecture's delta is not a luna artifact (ADR-22).

Two things follow for anyone building this kind of agent. **First: measure the failure mode before
picking the component.** Our own pre-measurement design led with a coverage planner, which the first
real run proved had nothing to do — we would have built it, seen no movement, and concluded that
scaffolding does not help. **Second: when one agent is asked to both act and account, the accounting
is what silently degrades.** Separating those roles cost us more tool calls and more money and bought
more than either. That trade is worth naming out loud, because it is the opposite of the usual
advice to keep the agent simple: here the simple agent was not less capable, it was less
*diligent* — and diligence is what documentation is made of.

---

## 6. Honesty discipline

- No number in this file appears without a link to a directory under `results/runs/`.
- Negative results get recorded. An iteration that made a metric worse is a changelog entry, not a
  deleted branch.
- A removed experiment is described together with what it taught us — the brief requires this
  explicitly.
- Cherry-picking cases is forbidden. Both published runs are scored against the whole corpus
  (`--all`), so no case selection took place at all; the runs that were not selected as the published
  pair are listed as history in §3 rather than deleted.
