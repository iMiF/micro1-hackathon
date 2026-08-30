# Benchmark gaps

Findings from the source audit. **No application changes were made.** Items below are recommendations for a later authoring pass if the benchmark needs more observable coverage. Do not implement them by leaking ground truth (OpenAPI in the app, status catalogs, debug panels, comments in JSON, etc.).

## API surface the UI never exercises

These routes and parameters exist on the server and are therefore part of the true API, but a browser-only agent will not see them unless it guesses HTTP after discovering neighboring endpoints.

| Gap | Evidence | Impact on evaluation |
| --- | --- | --- |
| `PATCH /api/orders/:id` updates `paymentStatus` (`unpaid` / `paid` / `refunded`) and emits `ORDER_UPDATED` activity | `registerOrderRoutes` in `apps/api/src/routes/orders.ts` ~304–344. No `api(... PATCH /api/orders/${id})` in `apps/web` except `DELETE` | Payment-status **write** schema and `ORDER_UPDATED` are not UI-discoverable. Reads of `paymentStatus` still appear on list/detail. |
| `GET /api/orders` accepts `customerId`, `from`, `to` | `apps/api/src/routes/orders.ts` ~19–53. `OrdersPage.vue` only sends `page`, `pageSize`, `q`, `status` | Date-range and related-entity list filters cannot be inferred from UI traffic. |
| `GET /api/dashboard/summary?period=` accepts any `Nd` window | `apps/api/src/routes/dashboard.ts` ~5–8. `DashboardPage.vue` hardcodes `period=30d` | Period encoding is visible once (`30d`) but not experimentally variable from the UI. |
| `PATCH /api/customers/:customerId/addresses/:addressId` | Implemented in `apps/api/src/routes/customers.ts` ~198–206 and in `saveAddress` in `CustomerDetailPage.vue` ~201–205 | Frontend never assigns `editingAddressId` (initialized `null` at line 145; no click-to-edit). Agents will only observe `POST` addresses. |

## Business errors that are hard or impossible from the happy-path UI

The API tests cover these codes; the Vue UI often prevents the request that would produce them.

| Error | API | Why the UI hides it |
| --- | --- | --- |
| `INVALID_STATUS_TRANSITION` | `PATCH /api/orders/:id/status` | `statusActions()` in `apps/web/src/orderStatus.ts` only renders allowed buttons. An agent that copies UI clicks never sees 409. |
| `CUSTOMER_ARCHIVED` | `POST /api/order-quotes` and `POST /api/orders` | `GET /api/customers/suggest` filters `archived = FALSE` (`customers.ts` ~16). Create-order autocomplete cannot select Carlos Rivera (seed id 103). |
| `PRODUCT_INACTIVE` | shipping, quotes, order create | `GET /api/products/suggest` filters `active = TRUE` (`products.ts` ~14). Inactive SKU-213 never appears in the order form. Catalog list can show it if Availability=Inactive, but that path does not feed the quote API. |
| `QUOTE_EXPIRED` (410) | `POST /api/orders` | TTL is 10 minutes (`QUOTE_TTL_MINUTES` in `quotes.ts` line 8). A short eval will not wait unless time is mocked. |
| `QUOTE_ALREADY_USED` | `POST /api/orders` | UI creates a fresh quote on every shipping/line change and submits once. Reuse requires a second `POST /api/orders` with the same `quoteId`. |
| `VERSION_CONFLICT` | customer PATCH, order PATCH, status PATCH | Single-user UI always sends the version it just loaded. Conflict needs two overlapping mutations. |
| `ORDER_NOT_EDITABLE` / invalid `paymentStatus` | `PATCH /api/orders/:id` | No UI at all. |
| Unknown `statusId` validation | status PATCH | UI only sends 20, 30, 40, 50 from buttons. |

`OUT_OF_STOCK` **is** UI-reachable: product 210 (Mouse Wireless, `stock_qty = 0`) is active, appears in suggest, and the order form still allows adding it (`OrderCreatePage.vue` ~167–175). Quote then returns 409.

`CUSTOMER_HAS_ORDERS` **is** UI-reachable: Delete on Alice Chen (101) after confirm.

`EMAIL_EXISTS` **is** UI-reachable: create/edit a customer with `alice@example.test`.

## Semantics that require inference, not a lookup API

This is mostly a **strength** of the benchmark. Do not add a status catalog endpoint.

- Order `statusId` values 10/20/30/40/50 are labeled only in the frontend (`apps/web/src/orderStatus.ts`). There is no `GET /api/order-statuses`.
- Shipping `methodId` 1–4 are not stored in the database. They are computed in `shippingOptionsFor` (`apps/api/src/domain/shipping.ts`). Method 5 (`International`) is unreachable because seed countries are only `CA` and `US` (`seed.ts` ~31–35).
- Tax rates are not returned as rates. Only `taxCents` appears on quotes and orders (`apps/api/src/domain/tax.ts`). Quebec (`QC`) uses the Canadian default 0.05, which is easy to misread as “no special provincial tax.”
- Dashboard revenue is `payment_status = 'paid' AND status_id NOT IN (10, 50)` (`dashboard.ts` ~14–16). The UI label is only “Revenue (30 days)” / “Paid orders (30 days)” — it does not mention excluding Draft and Cancelled.

## Workflow / UX holes that weaken observation

| Gap | Detail |
| --- | --- |
| Address rows are display-only | Table in `CustomerDetailPage.vue` has no edit/delete controls. No `DELETE` address route exists. |
| Notes have no list endpoint | `POST /api/orders/:id/notes` creates a note and `NOTE_ADDED` activity. Order GET does not include notes. The detail page form does not list prior notes; they only appear in Activity. |
| Products are read-only | No product POST/PATCH/DELETE. Stock changes only as a side effect of order create/delete. |
| Login pre-fills credentials | `LoginPage.vue` ~34–35. Reduces auth-discovery difficulty if the eval starts at `/login`. |
| CSRF is easy to copy, hard to understand | Token is in login/session JSON and auto-attached by `api()` (`apps/web/src/api.ts` ~26–28, 46–48). An agent that only replays `fetch` from DevTools may miss the header contract. |
| `pageSize` never changes in the UI | Always 20 on list pages; dashboard recent orders uses 5. Max 100 exists only on the server (`util.ts` `parsePageSize`). |
| Suggest vs collection | Create-order uses `/suggest` (limit 10, archived/inactive excluded). List pages use collection search. An agent might conflate them. |
| Order number year is hardcoded | New orders get `ORD-2026-${id}` (`orders.ts` ~264), independent of the real clock (`Today's date` in eval may differ). |
| Seed status history is compressed | Non-draft seed orders insert one `STATUS_CHANGED` from 10 → final status (`seed.ts` ~229–234), skipping intermediate hops. Live UI transitions are one step at a time. |

## Coverage the current app already provides well

Keep these; they are the benchmark’s actual difficulty:

- Multi-step create-order: suggest → addresses → shipping POST → quote POST → order POST with opaque `quoteId`.
- Numeric order status correlated with UI labels and `?status=`.
- Country → region dependent select.
- Optimistic concurrency `version` on customer save and status change.
- Destructive delete with confirm dialogs and 409 business rules.
- Soft-archive of customers; archived customers blocked from new quotes.
- Integer cents for all money.
- CSRF + session cookie.

## If a later pass must change the app

Prefer **observable but still undocumented** behavior over documentation:

1. Wire address-row click to `editingAddressId` so `PATCH` address appears in traffic (do not add a schema description).
2. Add a payment-status control on **draft** orders only, so `PATCH /api/orders/:id` is UI-visible without making shipped orders editable.
3. Expose order list date filters or a “orders for this customer” link that sends `customerId=`.
4. Do **not** add a status lookup API, tax-rate table endpoint, or shipping-method catalog.
5. Do **not** surface `QUOTE_TTL_MINUTES` in the UI. If expiry must be testable, shorten TTL in a dedicated eval seed, not in copy.
6. Do **not** pre-disable adding qty > stock if `OUT_OF_STOCK` should remain an error-inference case (current UI already allows it).

## Ground-truth facts that no case scores

`cases.json` is the final case set. `cases.draft.json` is the audit-step draft, kept for provenance: same 15 cases in the same order, with the same `difficulty` and `capabilities_tested`. The final file adds what an evaluator needs — a `case-NN-…` ID convention, the `challenging` flag (case-09/10/11), and ground truth by ID (`ground_truth_fact_ids` / `workflow_ids` / `action_ids`) instead of the draft's prose `ground_truth_items` — and rewords `why_this_case_is_useful` throughout and `user_goal` in three cases. Nothing in the draft contradicts it.

The facts below stay in `ground-truth/semantics.json` — they are part of the real API — but no case scores them, because a browser-only agent cannot observe them. Scoring them would measure HTTP guessing, not exploration.

| Fact | Why it is not browser-observable |
| --- | --- |
| `sem-version-conflict` | Every page sends the `version` from its own last read and refreshes it from the mutation response (`CustomerFormPage.vue` navigates away on success; `toggleArchive` in `CustomerDetailPage.vue` and `changeStatus` in `OrderDetailPage.vue` reload). A conflict needs two overlapping mutations. |
| `sem-invalid-status-transition` | `statusActions()` renders only legal next states, and `PATCH /api/orders/:id/status` checks `version` **before** the transition graph, so a stale page yields `VERSION_CONFLICT` first. |
| `sem-csrf-invalid` | `api()` attaches `x-csrf-token` to every mutation, and the auth hook throws `UNAUTHENTICATED` before the CSRF check once the session is gone. |
| `sem-quote-single-use` | The order form re-quotes on every line/address/method change and submits once, then navigates to the created order. Reuse needs a second `POST /api/orders` with the same `quoteId`. |
| `sem-draft-delete-only` | `Delete draft` renders only for `statusId = 10`, so the 409 never happens. Only the UI side of the rule is observable. |
| `sem-customer-archived-blocks-orders` | `GET /api/customers/suggest` filters `archived = FALSE`, so an archived customer cannot be selected in the order form. |
| `sem-product-inactive` | `GET /api/products/suggest` filters `active = TRUE`, so an inactive SKU never reaches the quote. |
| `sem-quote-expires` | 10-minute TTL; a short eval will not wait unless time is mocked. |

`sem-product-q`, `sem-product-active-filter` and `sem-suggest-limit` are observable, but no case scores them either: `case-02` already covers the same query shapes on customers.

Everything else referenced by a case was checked against `apps/web` and is reachable by clicking: all five order statuses and the whole transition graph appear in the seed, `OUT_OF_STOCK` and `CUSTOMER_HAS_ORDERS` and `EMAIL_EXISTS` are reachable, all three `paymentStatus` values appear in seeded orders, shipping methods 1–4 follow from the CA and US seed addresses, and Quebec makes the Canadian default tax rate distinguishable from Alberta.
