# 07. Safety, risk policy, and human control

> **Status:** draft (policy designed, mechanics not implemented)
> **Updated:** 2026-08-29
> **Source of truth:** brief §"Ground rules" 04–08
> **Maps to:** ground rules 04, 05, 06, 07, 08; Agent Solution & Engineering criterion

---

## 1. Scope

AAE is intended for **synthetic, sandboxed, or explicitly permitted** environments. It does not
try to "test everything possible" regardless of consequences.

A tool that probes someone else's API by trial and error is inherently risky. That's why the
boundary is drawn not in the prompt but in the harness's code: **risk policy is applied before an
action executes** and can require simulation or a human.

---

## 2. Action classes and policy

| Class | Examples | Policy |
| --- | --- | --- |
| `READ_ONLY` | Open a page, change a filter, `GET /api/*` | Allow automatically |
| `SAFE_MUTATION` | Create a test draft in a seeded sandbox | Allow only in a controlled case; log it |
| `REVERSIBLE` | Change a test order's status, add a comment | Allow if on the allowlist; save the ID and a rollback plan |
| `DESTRUCTIVE` | Delete a customer, delete an order, reset a password | Block or simulate; human approval if allowed at all |
| `EXTERNAL_SIDE_EFFECT` / `UNKNOWN` | Send an email, a payment, a publish action, an unclear action | Block. No external effects without separate authorization |

**Classification happens before the action**, based on the pair "UI element + expected request."
`UNKNOWN` defaults to blocking: an unrecognized action is treated as dangerous, not safe.

Every policy decision is recorded as `policy_decision` evidence
([`08`](08-evidence-and-trajectories.md)) — the judge sees not only what the agent did, but also
what it was not allowed to do.

### Applied to MiniCRM

The target has two destructive actions reachable from the UI: deleting a customer and deleting a
draft order. Both are covered by cases (`case-13`, `case-14`) — but specifically as a check that
the agent **correctly handles rejection and confirmation**, not as permission to delete anything.

---

## 3. Human control

**Ground rule 04:** consequential actions go through a sandbox or simulation, with human approval
**before** the action.

**Ground rule 05:** a qualified human reviewer is part of the solution when it could materially
affect someone.

How this looks in our system:

| Control point | What the human does | When |
| --- | --- | --- |
| **Scope definition** | Sets the URL, credentials, action allowlist, budgets (run configuration, not a case field) | Before the run |
| **Approval gate** | Confirms or rejects a `DESTRUCTIVE`-class action | During the run, before the action |
| **Output review** | Checks the final documentation before use | After the run |

The third point isn't a formality. **AAE's output is a draft spec, not a source of truth.**
Documentation flagged as agent-verified should not be used for integration without human review —
the cost of a mistake in an API contract carries downstream consequences.

This statement must be written explicitly in the submission README and in the header of the
generated artifacts.

---

## 4. Data and credentials

**Ground rules 06, 07, 08.**

| Requirement | Our status |
| --- | --- |
| Legal and ethical use case | ✅ Only our own synthetic application is probed |
| Public / synthetic / approved anonymous data | ✅ MiniCRM is fully synthetic; no external services are called |
| Credentials kept out of the submission | ⚠️ see below |
| Personal data separated from artifacts | ⚠️ requires redacting request bodies in evidence |

### Demo credentials

`admin@minicrm.local` / `demo123` appear in the target's `README.md`, in the seed, and are
pre-filled in `miniCRM/apps/web/src/pages/LoginPage.vue`.

This is **not a secret** — it's an account for a local synthetic app that gets spun up from docker
compose on the judge's machine. Ground rule 08 isn't violated: there's no private information.

But pre-filling the login form weakens the benchmark — it simplifies auth discovery more than
intended. This is a benchmark quality issue, not a security one. OQ-3 in
[`11`](11-decisions-and-open-questions.md).

**Submission rule:** no real credentials, API keys, or tokens anywhere in the repository, in run
artifacts, or in the video. Before submission — a secret-scanning pass over the repo and over
`artifacts/`.

### Evidence redaction

Request and response bodies are saved in evidence. In MiniCRM they're synthetic, but the redaction
mechanism needs to exist ahead of time — it's part of the product, not the benchmark:

- fields that look like passwords, tokens, and keys are replaced with `[redacted]` before being
  written;
- redaction is applied **at write time**, not at display time.

---

## 5. Safety checklist before submission

- [ ] Every verified claim has a non-empty, valid `evidence` block
- [ ] Evidence includes both UI context **and** a network observation for semantic transitions
- [ ] A conflicting or single observation remains an uncertainty, not a claim
- [ ] Destructive, external, and unknown actions are blocked or simulated
- [ ] Policy decisions are recorded as evidence and visible in the trajectory
- [ ] No production credentials, personal data, or sensitive request bodies in the submission
- [ ] Human approval is demonstrated for actions outside the safe sandbox policy
- [x] The README and the header of generated artifacts state that the output requires human review
