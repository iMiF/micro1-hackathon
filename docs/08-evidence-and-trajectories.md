# 08. Evidence, provenance, and trajectories

> **Status:** draft (formats designed, collection not implemented)
> **Updated:** 2026-08-29
> **Source of truth:** brief deliverable 04, ground rule 09
> **Maps to:** deliverable 04 (Agent trajectories), ground rule 09

---

## 1. Why this is a separate document

Ground rule 09: *"Connect every claim about your results to the evidence you submit."*
Deliverable 04 requires trajectories for **every** agent used.

Both are easy to do formally and uselessly — a log dump a judge can't get through in five minutes.
So the formats are defined up front, rather than derived from whatever happened to end up in a log.

---

## 2. Two levels of evidence

Easy to conflate, and conflating them is costly. The levels live in different artifacts and serve
different purposes.

| | **Level 1: in the submission** | **Level 2: in run artifacts** |
| --- | --- | --- |
| Where | Inside `reconstruction.json` | `artifacts/runs/<run-id>/evidence/` |
| Form | Nested `evidence` objects | Entries with `ev_NNN` identifiers |
| Defined by | `miniCRM/benchmark/schemas/reconstruction-output.schema.json` | Our harness |
| Who reads it | The deterministic evaluator | The judge and a human reviewer |
| Affects score | Yes | No |

### Level 1 — evidence in the submission

The schema allows seven kinds, all limited to what's visible in the browser:

| `kind` | Minimally meaningful fields |
| --- | --- |
| `network_request` | `method`, `path`, `json_paths` |
| `network_response` | `method`, `path`, `status`, `json_paths` |
| `ui_label` | `page`, `ui_text` |
| `ui_control` | `page`, `ui_text` |
| `ui_action` | `page`, `ui_text`, `note` |
| `cookie` | `cookie_name`, `note` |
| `header` | `header`, `note` |

Only `kind` is required. Citing source code is not allowed: this is stated in the schema
description ("Do not cite source code") and structurally enforced by the `kind` list — all seven
kinds are only observable from the browser.

**Rule for semantic claims:** a single network observation isn't enough. A claim about the
*meaning* of a value needs both UI evidence (`ui_label` / `ui_control` / `ui_action`) and network
evidence (`network_request` / `network_response`) — otherwise it's an interpretation of traffic,
not an observed connection.

### Level 2 — run store

Our harness keeps its own log with identifiers. It's richer than the schema because it has to
explain the agent's behavior, not just justify the facts:

| Type | Minimal fields | Example link |
| --- | --- | --- |
| `ui_action` | URL, element label, action, before/after snapshots | The "Mark shipped" button was clicked |
| `network_event` | method, path, status, hash/reference to bodies, correlation id | `PATCH /api/orders/12/status`, body `statusId=40` |
| `state_transition` | entity, before/after fields, UI state | `Processing → Shipped` |
| `experiment` | hypothesis id, decision, expected discriminator, result | Repeated on another order |
| `policy_decision` | risk class, allow/block/approval, reason | Deletion blocked by policy |

> **The evaluator never reads level 2.** It only works with what's inside `reconstruction.json`.
> Linking the two levels with cross-referencing identifiers would be convenient for auditing, but
> would require a schema change — OQ-8 in [`11`](11-decisions-and-open-questions.md).

---

## 3. Claims and verification

`definitions.claim` in the schema:

```json
{
  "id": "claim-order-status-40",
  "statement": "PATCH /api/orders/{id}/status with statusId=40 moves the order to the Shipped state.",
  "supports": ["fact-order-status-40"],
  "confidence": 0.96,
  "evidence": [
    {"kind": "ui_control", "page": "/orders/12", "ui_text": "Mark shipped"},
    {"kind": "network_response", "method": "PATCH", "path": "/api/orders/{id}/status",
     "status": 200, "json_paths": ["statusId"]},
    {"kind": "ui_label", "page": "/orders/12", "ui_text": "Shipped"}
  ]
}
```

| Field | Required | Meaning |
| --- | :---: | --- |
| `id` | ✅ | Identifier within the document |
| `statement` | ✅ | The claim in human language |
| `supports` | | Which facts/operations it backs |
| `confidence` | | A number 0..1; supplements verification, doesn't replace it |
| `evidence` | | Nested evidence |

The verification result within the submission is expressed via `confidence` and the presence of
sufficient `evidence`. The detailed log (`verification.rule`, conflicts, hypothesis history) lives
at level 2 — in the run trajectory.

### Verification rules

| Rule | Condition |
| --- | --- |
| `two_independent_observations` | Same result on two different objects or in two different sessions |
| `ui_label_matches_request` | The visible label and the request content agree |
| `state_after_matches_claim` | The UI state after the action matches the claim |
| `single_observation` | One observation → the claim doesn't make it into verified output |
| `conflicting_observations` | Observations diverged → `uncertain`, the conflict is recorded |

**A claim that fails verification does not enter the verified output.** It may end up in a
hypotheses section with an explicit flag (`notes` or a low `confidence`) — but not in the spec.

---

## 4. Trajectories

Deliverable 04 requires the trajectory to be **easy to trace** from the agent's instructions to
the final result, with visible tool responses, feedback, retries, and human checkpoints.

### Step format

`trajectory.jsonl`, one line per step:

```json
{
  "step": 17,
  "phase": "experiment",
  "reasoning_summary": "statusId=40 observed once; need a second object",
  "tool_call": {"name": "click", "args": {"element_id": "btn-mark-shipped"}},
  "policy": {"class": "REVERSIBLE", "decision": "allow", "reason": "on the case allowlist"},
  "tool_response": {"ok": true, "url": "/orders/14"},
  "observation_ref": "ev_061",
  "ledger_delta": {"claim_enum_order_status_40": "single → verified"},
  "next_step_reason": "hypothesis confirmed, moving on to products coverage"
}
```

What's required here and why:

- `policy` — shows the risk classifier at work (ground rule 04) even when the decision is "allow."
- `observation_ref` — links the step to evidence, keeping the chain "step → evidence → claim"
  traceable.
- `ledger_delta` — shows that the agent **updated** its knowledge, not just made a call.
- `next_step_reason` — the exact "feedback that shaped the next step" the brief requires.

### What gets submitted to the judge

Full trajectories of every run are too large. We submit:

1. **Full** trajectories of one baseline run and one AAE run on the same case — a direct
   side-by-side comparison of behavior on identical input.
2. The **full** AAE trajectory on the primary hard case.
3. For each role inside AAE, if the orchestration is multi-agent, a representative trajectory.
4. An index, `artifacts/runs/INDEX.md`, linking to every run.

The "for every agent" requirement is interpreted as "for every distinct instructed role," not "for
every run."

### Readability

Every submitted trajectory comes with a `report.md` — a human-readable retelling: what the agent
searched for, which hypotheses it formed, where it made mistakes, where it retried, where a human
stepped in. The judge reads `report.md` and uses `trajectory.jsonl` to verify it.

---

## 5. Evidence checklist before submission

- [ ] Every fact and claim in the submitted reconstruction has a non-empty, valid `evidence` block
- [ ] Every semantic claim rests on at least two pieces of evidence: UI and network
- [ ] No evidence cites source code (the schema forbids it)
- [ ] Conflicts are recorded, not lost
- [ ] Policy decisions are visible in the trajectory, including the ones that allowed an action
- [ ] There's a run index and a `report.md` for every submitted trajectory
- [ ] No number in the report exists without a link to a run
