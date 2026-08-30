# Autonomous API Explorer — Project Documentation

> **Status:** active
> **Updated:** 2026-08-29
> **Language:** English
> **Scope:** the whole project's documentation (agent + benchmark + MiniCRM target app)
> **Location:** project root, next to the target app `miniCRM/`, not inside it

Autonomous API Explorer (AAE) is an agentic system that turns the observed behavior of an
undocumented web application into verifiable API documentation. The project is submitted to the
**micro1 Agentic Workflows Hackathon**.

---

## Documentation map

| # | File | About | Who needs it |
| --- | --- | --- | --- |
| — | [`README.md`](README.md) | This index and maintenance rules | everyone |
| 00 | [`00-hackathon-requirements.md`](00-hackathon-requirements.md) | Hackathon rules verbatim + compliance matrix | everyone, before every scope decision |
| 01 | [`01-problem-and-value.md`](01-problem-and-value.md) | Problem, user, value, MVP boundaries | submission README, video |
| 02 | [`02-architecture.md`](02-architecture.md) | AAE architecture, observation contract, isolation | engineers |
| 03 | [`03-target-minicrm.md`](03-target-minicrm.md) | MiniCRM as target: stack, run instructions, real API surface | engineers, ground-truth authors |
| 04 | [`04-benchmark-contract.md`](04-benchmark-contract.md) | Public benchmark contract: cases, output schema, fairness | engineers, judges |
| 05 | [`05-evaluation-and-metrics.md`](05-evaluation-and-metrics.md) | Primary metric, secondary metrics, report form | engineers, judges |
| 06 | [`06-baseline-and-changelog.md`](06-baseline-and-changelog.md) | Baseline definition + Improvement Changelog | deliverable 01 |
| 07 | [`07-safety.md`](07-safety.md) | Risk policy, human control, data handling | deliverable 01, ground rules 04–08 |
| 08 | [`08-evidence-and-trajectories.md`](08-evidence-and-trajectories.md) | Evidence, provenance, trajectory requirements | deliverable 04 |
| 09 | [`09-status-and-roadmap.md`](09-status-and-roadmap.md) | What's done, what isn't, plan and quality gates | everyone, weekly |
| 10 | [`10-source-review.md`](10-source-review.md) | Archive: reconciliation of the original RU document against the code | archive/audit |
| 11 | [`11-decisions-and-open-questions.md`](11-decisions-and-open-questions.md) | Decision log (ADR) and open questions | everyone |

---

## Relationship to source material

This documentation replaces `Autonomous_API_Explorer_Technical_Documentation_RU.pdf` (v1.0,
2026-08-29). That PDF is a **concept document**, written before reconciliation with the code: it
remains historical context and is not a source of truth. A line-by-line reconciliation of its
claims against the code is preserved in the archive [`10-source-review.md`](10-source-review.md).

The primary source of the rules is `micro1 - First Hackathon97ce7c5.pdf` (the brief, 10 pages,
including an appendix with three examples on pages 8–10). Verbatim requirements are extracted into
[`00-hackathon-requirements.md`](00-hackathon-requirements.md).

---

## Maintenance rules

### Hierarchy of sources of truth

If two sources disagree, the higher one wins:

1. **Hackathon brief** (`micro1 - First Hackathon97ce7c5.pdf`) — for everything about rules,
   deliverables, and judging.
2. **Source code** `miniCRM/apps/api`, `miniCRM/apps/web`, `miniCRM/db/migrations` — for
   everything about MiniCRM's behavior.
3. **`miniCRM/benchmark/ground-truth/*`** — for machine-readable facts. Derived from (2); on
   disagreement it is regenerated, not hand-edited.
4. **`docs/*`** — this documentation. Derived from (1)–(3).
5. Concept PDF — historical context only.

### How to cite facts

Every factual claim about MiniCRM is backed by a pointer into the code:
`miniCRM/apps/api/src/domain/tax.ts → taxRateFor`. Line numbers are not used — they go stale;
symbol names outlive them.

A claim about a **result** (a number, a metric, a comparison) without a run reference is
**forbidden**. See ground rule 09 in [`00-hackathon-requirements.md`](00-hackathon-requirements.md).

### Metadata block in every file

```
> **Status:** draft | active | frozen
> **Updated:** YYYY-MM-DD
> **Source of truth:** <where the facts come from>
```

`draft` — the content may still change wholesale.
`active` — safe to rely on; changes are incremental.
`frozen` — change only via an entry in [`11-decisions-and-open-questions.md`](11-decisions-and-open-questions.md).

### When to update what

| Event | Update |
| --- | --- |
| MiniCRM code changed | `03`, regenerate `miniCRM/benchmark/ground-truth/`, check `04` |
| A case was added or changed | `04`, `05` |
| A run was performed | `06` (changelog entry), `09` (status) |
| An architectural decision was made | `11` (ADR), then the affected file |
| The interpretation of the rules changed | `00`, then everything that depends on it |

### What does NOT belong here

- Secrets, real credentials, personal data (ground rule 08).
- Result numbers not sourced from the experiment ledger.
- Human-readable copies of ground truth "for the agent."

---

## ⚠️ Isolation from the agent

`docs/` and the entire target tree — `miniCRM/benchmark/`, `miniCRM/apps/api`, `miniCRM/apps/web`,
`miniCRM/db/`, and the tests — **must never enter the tool context of the evaluated agent**. The
agent only ever sees the running UI at `http://localhost:5173` and same-origin `/api` network
traffic.

The documentation lives at the project root, not inside the target: `miniCRM/` is the app under
test, while `docs/` describes, among other things, the agent that explores it and future
components alongside it. The mechanical safeguard against leakage is described in
[`04-benchmark-contract.md`](04-benchmark-contract.md) §1.
