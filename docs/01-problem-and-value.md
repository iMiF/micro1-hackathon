# 01. Problem, user, and value

> **Status:** active
> **Updated:** 2026-08-29
> **Source of truth:** hackathon brief §"Your challenge"; project concept
> **Maps to criterion:** Problem & User Value (15 points)

---

## 1. Who has this problem

**Primary user: an integration/backend engineer tasked with connecting to an internal or legacy
web application that has no up-to-date API documentation.**

Concrete portrait: a developer who gets access to a staging environment for someone else's system
(or their own, long forgotten) and has a few days to figure out which HTTP operations exist, what
their parameters are, what the numeric enums mean, and which business rules the server enforces
silently.

Adjacent users for whom the value is the same:

| Role | Situation |
| --- | --- |
| Migration team | Migrating a system whose old API behavior is written down nowhere |
| QA / SDET | Writing API tests for an application with no spec |
| Platform engineering | Inventorying internal services before rolling out an API gateway |
| Technical due diligence | Assessing someone else's system before a purchase or integration |

---

## 2. What bottleneck makes this worth solving

Today the path looks like this: open DevTools, click around the UI, jot down requests, guess at
what the fields mean, ask whoever "sort of knew," write it up in Confluence, discover a month
later that half of it is wrong.

Three specific places where this process breaks:

1. **HTTP traffic alone isn't enough for meaning.** A request `PATCH /api/orders/12/status` with
   body `{"statusId": 40, "version": 3}` shows the shape, not the meaning. What is 40? Why is
   `version` required? What happens if you send 50 from state 40? The answer lives in the chain
   "UI action → request → response → new UI state," not in the request itself.

2. **Hidden dependencies are invisible in a single request.** Creating an order in MiniCRM
   requires the chain `suggest → addresses → shipping/options → order-quotes → orders`, where an
   opaque `quoteId` carries state between steps and lives for 10 minutes. No HAR file explains
   that this identifier cannot be reused.

3. **Plausible guesses are more costly than gaps.** An LLM given a HAR file will happily write
   "`status: 4` means shipped." An engineer who relies on that will find the bug in production.
   Documentation that flags the unknown as unknown is more useful than documentation that is
   confident and wrong.

**Why this is worth solving:** the result isn't text — it's the ability to integrate safely. The
difference between "two days of digging with a risk of getting it wrong" and "a spec that states,
for every claim, which observation it rests on."

---

## 3. Solution formula

**Input:** staging environment URL + permitted credentials.

**Output:** structured API reconstruction + OpenAPI + human-readable documentation + dependency
and workflow graph + confidence report + evidence bundle.

**The mechanism that creates the value** is not merely crawling the UI — it's a cycle of
experimental reverse engineering:

> observe → form a hypothesis → safely test it → record **only what's confirmed**

The key difference from "an LLM given a HAR file": the agent can *run an experiment*. Having seen
`statusId: 40` once, it doesn't name the value — it finds another order, clicks the specific
button with a visible label, and checks whether the result matches. Two independent observations
→ a fact. One observation or a conflict → explicit uncertainty.

---

## 4. Positioning

| Approach | What it does well | Limitation | AAE's position |
| --- | --- | --- | --- |
| DevTools / HAR / proxy | Shows the actual requests | Doesn't explain which action triggered the request or what the values mean | Used as primary evidence |
| OpenAPI scanners, traffic-to-spec | Builds a syntactic skeleton | Doesn't recover semantics, workflows, hidden dependencies | Adds UI context, hypotheses, a verification loop |
| RPA / browser automation | Executes known scenarios | Doesn't reconstruct an unknown model | Reuses the browser as an exploration tool |
| Manual reverse engineering | Rich context | Expensive, doesn't scale, not reproducible | Formalizes the path from observation to a provable claim |
| LLM given a HAR file | Fast draft | Weak on semantics and dependencies, prone to plausible hallucination | A reasonable **baseline**, not the final agent |

---

## 5. MVP boundaries

| Supported | Deliberately **not** included |
| --- | --- |
| Single-page web apps | GraphQL, WebSocket, gRPC-web |
| REST / JSON | CAPTCHA, OAuth discovery, cross-domain SSO |
| Cookie session + CSRF header | Bearer tokens (not present in the target — see [`03`](03-target-minicrm.md)) |
| Chromium via Playwright | File uploads, payments |
| XHR / fetch | Arbitrary production sites |
| Synthetic/permitted environments only | Bypassing protections of any kind |

> The target has no bearer tokens, so support for that auth method isn't claimed: claiming a
> capability with no backing case violates ground rule 09.

---

## 6. How we verify the solution actually works

The claim "the agent reconstructs the API better" is only testable on a controlled target whose
ground truth is known to the authors and hidden from the agent. That's why the project includes
its own benchmark — **MiniCRM** ([`03`](03-target-minicrm.md)) — and a deterministic evaluator
([`05`](05-evaluation-and-metrics.md)).

This answers the brief's question 04 ("Can another person reproduce the result?"): not "trust the
demo," but "run the same 15 cases from the same run configuration and get the same numbers."
