# 03. MiniCRM as a controlled target

> **Status:** active
> **Updated:** 2026-08-29
> **Source of truth:** `miniCRM/apps/api/src`, `miniCRM/apps/web/src`, `miniCRM/db/migrations` (code), `miniCRM/benchmark/INVENTORY.md` (audit)
> ⚠️ **AUTHOR-ONLY.** This file never enters the evaluated agent's context.

This document describes the target as an **engineering artifact**: stack, how to run it,
boundaries, guarantees. The detailed API surface and semantics live in
`miniCRM/benchmark/INVENTORY.md` (human-readable) and `miniCRM/benchmark/ground-truth/*.json`
(machine-readable). They are **not duplicated** here, so a second source of truth doesn't appear
and start drifting from the first.

---

## 1. What it is and why

MiniCRM is a synthetic CRM for an online store: staff manage customers, products, and orders. It
exists for exactly one reason: to keep the benchmark fair — the authors know the model completely,
the agent doesn't see it at all.

**Is not:** production software, a product for payments/tax/shipping. Tax amounts are synthetic
benchmark logic, not tax advice. Data is synthetic. No external services, email, analytics, or
payment providers are called.

**Key property:** the application **does not expose** an OpenAPI spec, a status reference, a
shipping-method catalog, or a tax-rate table. The meaning of numeric values can only be derived
from tying "UI label ↔ traffic" together. This isn't an oversight — it *is* the benchmark's
difficulty.

---

## 2. Stack and versions

| Layer | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | 22 (`.nvmrc`) |
| Backend | Fastify | 5 |
| Frontend | Vue 3 + TypeScript + Vite + Vue Router | — |
| DB | PostgreSQL | 17 (docker compose) |
| TypeScript | | 5.7.3 |
| E2E | Playwright | 1.50.1 |
| Monorepo | npm workspaces | `miniCRM/apps/*` |

The browser talks to `http://localhost:5173`; Vite proxies same-origin `/api` to Fastify
(`http://localhost:3000`). For the agent this means: **all traffic is same-origin**, there's no
separate API host to see.

---

## 3. Running and resetting

```bash
cd miniCRM        # all target commands run from its directory
npm install
docker compose up -d --wait
npm run db:reset
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`
- PostgreSQL: `127.0.0.1:15432` (Compose publishes this host port, not 5432)
- Demo login: `admin@minicrm.local` / `demo123`

**Reset:**

```bash
npm run db:reset
```

Resets the application data, re-runs migrations, and restores the same deterministic seed. This is
an **out-of-band developer command**: there is no HTTP reset endpoint, and one must not be added —
the agent should never be able to "restart the world."

**Tests:**

```bash
npm run typecheck
npm run test:api      # resets the DB on its own
npx playwright install chromium
npm run test:e2e      # expects PostgreSQL to be running
```

### ⚠️ Sessions live in process memory

`miniCRM/apps/api/src/session.ts` stores sessions in a `Map` inside the Fastify process.
Restarting the API invalidates every session. Consequence for the benchmark: **the runner must not
restart the API mid-run**, and `db:reset` does not clear sessions — the reset order "stop API →
reset → start API" is mandatory for reproducibility. Recorded as ADR-4 in
[`11`](11-decisions-and-open-questions.md).

---

## 4. API surface

The server registers **28 routes**. Of those, **26 are reachable through the UI** and make up the
browser-benchmark scope; exactly those 26 are described in
`miniCRM/benchmark/ground-truth/api.json`. The full list of all 28, including the unreachable ones,
is in `miniCRM/benchmark/INVENTORY.md`.

| Group | Routes | File |
| --- | ---: | --- |
| Auth | 3 | `miniCRM/apps/api/src/routes/auth.ts` |
| Customers (+ addresses) | 9 | `miniCRM/apps/api/src/routes/customers.ts` |
| Orders (+ notes, status, activity) | 8 | `miniCRM/apps/api/src/routes/orders.ts` |
| Products | 3 | `miniCRM/apps/api/src/routes/products.ts` |
| Geo (countries/regions) | 2 | `miniCRM/apps/api/src/routes/geo.ts` |
| Quotes | 1 | `miniCRM/apps/api/src/routes/quotes.ts` |
| Shipping | 1 | `miniCRM/apps/api/src/routes/shipping.ts` |
| Dashboard | 1 | `miniCRM/apps/api/src/routes/dashboard.ts` |

### Out of browser-benchmark scope (2 routes)

| Route | Why excluded |
| --- | --- |
| `PATCH /api/orders/{id}` | Changes `paymentStatus`; there's no UI control anywhere that calls it |
| `PATCH /api/customers/{customerId}/addresses/{addressId}` | Dead path in the frontend: `editingAddressId` is initialized to `null` and never assigned |

These routes exist and are part of the real API, but a browser-only agent will never see them.
They must not be scored — that would measure guessing, not exploration.

---

## 5. What makes the target hard (and must be preserved)

The list of things the benchmark's entire point rests on. When editing the app, these properties
are the first thing to protect:

| Property | Why it's hard |
| --- | --- |
| Multi-step order creation | `suggest → addresses → shipping/options → order-quotes → orders`; an opaque `quoteId` carries state |
| Numeric order statuses | Labels exist only in the frontend (`miniCRM/apps/web/src/orderStatus.ts`); there's no API reference |
| Restricted state transitions | Allowed transitions are defined in `miniCRM/apps/api/src/domain/status.ts`; the UI only shows valid buttons, so a 409 is never seen from the UI |
| Dependent country → region select | Conditional calls to `GET /api/regions` |
| `version` optimistic locking | A hidden dependency on the previous GET |
| Shipping methods aren't stored in the DB | Computed in `miniCRM/apps/api/src/domain/shipping.ts` depending on country and total |
| Tax is returned only as an amount | Rates aren't returned; `miniCRM/apps/api/src/domain/tax.ts` |
| Money is integer cents | Easy to get the type wrong |
| Cookie session + CSRF header | The header is auto-attached by the client; an agent that copies a `fetch` call from DevTools will miss the contract |
| Business-rule 409/422 rejections | Deleting a customer with orders, an archived customer, insufficient stock |
| Soft-archiving of customers | Archived customers don't appear in `suggest` but are visible in the list |

**Explicitly forbidden to add:** an OpenAPI spec inside the app, a status-reference endpoint, a
shipping-method catalog, a tax-rate table, a debug panel, hint comments in JSON responses. Any of
these would turn the benchmark into a reading test instead of an exploration test.

---

## 6. Known target gaps

Full audit: `miniCRM/benchmark/GAPS.md`. In brief, three classes:

1. **API surface the UI never exercises.** The order list's `customerId`, `from`, `to` filters;
   the dashboard's arbitrary `period` window; writing `paymentStatus`. Not scored.

2. **Errors unreachable from the happy-path UI.** `INVALID_STATUS_TRANSITION` (the UI only draws
   the allowed buttons, and the server checks `version` before the transition graph),
   `CUSTOMER_ARCHIVED` (archived customers are filtered out of suggest), `PRODUCT_INACTIVE`,
   `QUOTE_EXPIRED` (10-minute TTL — a short run won't wait that long), `QUOTE_ALREADY_USED`,
   `VERSION_CONFLICT` (needs two overlapping edits), `CSRF_TOKEN_INVALID` (the client always
   attaches the header), `ORDER_CANNOT_BE_DELETED` (the delete button is only drawn for a draft).

3. **UX gaps that weaken observation.** An address can be added but not edited or deleted (the
   address table rows are read-only); notes have no list endpoint; products are read-only;
   `pageSize` can't be changed from the UI (20 on list pages, 5 for recent orders on the
   dashboard), even though the server accepts up to 100; the login form pre-fills credentials.

The third point produces open question OQ-3 ([`11`](11-decisions-and-open-questions.md)): the
pre-filled login simplifies auth discovery more than intended.

Facts about behavior unreachable from the browser remain in ground truth — they're part of the
real API — but aren't scored by any case (ADR-8 in [`11`](11-decisions-and-open-questions.md)).
Their list, with an explanation of exactly what blocks each path, is in
`miniCRM/benchmark/GAPS.md` §"Ground-truth facts that no case scores."

---

## 7. Rules for changing the target

1. The target is **frozen** as of the first scored run. Any change devalues results already
   collected.
2. Before the freeze: code change → regenerate `miniCRM/benchmark/ground-truth/` via
   `miniCRM/benchmark/scripts/emit-ground-truth.mjs` → `validate-ground-truth.mjs` → update
   `application_commit` in `manifest.json`.
3. Prefer observable-but-undocumented behavior over documenting it. If an operation needs to be
   made visible, add a UI control for it, rather than a description in an API response.
4. Never add a reset endpoint, value-reference lookups, or debug panels.

Current pinned target commit: `miniCRM/benchmark/ground-truth/manifest.json → application_commit`.
