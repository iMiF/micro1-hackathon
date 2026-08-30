# MiniCRM ground-truth inventory

Everything below is taken from the repository. Line numbers are approximate and refer to the files as of this audit.

**Scope distinction**

- **UI-called:** `apps/web` issues the request.
- **API-only:** registered in Fastify but not triggered by any reachable Vue handler (or only via dead code).

There is no OpenAPI served by the app. Machine-readable author ground truth is `benchmark/ground-truth/api.json`.

---

## 1. User-facing pages / routes

Source: `apps/web/src/router.ts` routes ~6–18. Guard: `router.beforeEach` ~21–26 calls `fetchSession()` (`apps/web/src/session.ts` ~25–35 → `GET /api/auth/session`) for every non-public route. Unauthenticated users are redirected to `/login`.

| Route | Page | Auth |
| --- | --- | --- |
| `/login` | `LoginPage.vue` | public (`meta.public`) |
| `/` | `DashboardPage.vue` | session required |
| `/customers` | `CustomersPage.vue` | session required |
| `/customers/new` | `CustomerFormPage.vue` (create) | session required |
| `/customers/:id/edit` | `CustomerFormPage.vue` (edit) | session required |
| `/customers/:id` | `CustomerDetailPage.vue` | session required |
| `/orders` | `OrdersPage.vue` | session required |
| `/orders/new` | `OrderCreatePage.vue` | session required |
| `/orders/:id` | `OrderDetailPage.vue` | session required |
| `/products` | `ProductsPage.vue` | session required |
| `/products/:id` | `ProductDetailPage.vue` | session required |

**11 routes, 10 page components** (`CustomerFormPage.vue` serves both `/customers/new` and `/customers/:id/edit`). Shared chrome: `AppLayout.vue` (sidebar nav + logout) on all pages except login.

Nav targets (`AppLayout.vue` ~5–8): `/`, `/customers`, `/orders`, `/products`.

---

## 2. Meaningful user actions

Each row is a user-initiated action. Navigation that only changes the path still triggers `GET /api/auth/session` via the router guard.

### Auth and shell

| Action | Where | API effect |
| --- | --- | --- |
| Sign in | `LoginPage.vue` `onSubmit` ~39–50 | `POST /api/auth/login` then navigate `/` |
| Log out | `AppLayout.vue` `onLogout` ~27–29 | `POST /api/auth/logout` then `/login` |
| Open Dashboard / Customers / Orders / Products | sidebar links | session GET + page loads |

### Customers

| Action | Where | API effect |
| --- | --- | --- |
| Search by name/email | `CustomersPage.vue` watch `q` ~102, debounce 250ms | `GET /api/customers?page&pageSize&q&archived?` (page reset to 1) |
| Filter Active / Archived / All | select `archived` ~20–24 | `archived=false`, `archived=true`, or omit |
| Paginate | `PaginationBar.vue` | `page` increment/decrement; `pageSize` fixed 20 |
| Open customer | name link ~40 | navigate `/customers/:id` |
| Add customer | link `/customers/new` | navigate |
| Create customer | form submit `CustomerFormPage.vue` ~84–93 | `POST /api/customers` |
| Edit customer | detail → `/customers/:id/edit` | `GET /api/customers/:id` on mount if `params.id` |
| Save customer | submit ~71–81 | `PATCH /api/customers/:id` with `version` |
| Cancel form | `router.back()` | none |
| Archive / Unarchive | `toggleArchive` `CustomerDetailPage.vue` ~163–174 | `PATCH` `{ archived, version }` |
| Delete customer | confirm dialog ~100–106, `deleteCustomer` ~176–186 | `DELETE /api/customers/:id` |
| Add address | `saveAddress` ~188–221 | `POST /api/customers/:id/addresses` then reload addresses |
| Change country | watch `form.countryCode` ~223–235 | `GET /api/regions?country=` |

Address **edit** (`PATCH .../addresses/:addressId`) is compiled but **not reachable**: `editingAddressId` is never set (`CustomerDetailPage.vue` ~145, ~201).

### Orders

| Action | Where | API effect |
| --- | --- | --- |
| Search | `OrdersPage.vue` | `GET /api/orders?page&pageSize&q&status?` |
| Filter status | select bound to `ORDER_STATUS_LABELS` | `status=<numeric id>` or omit |
| Paginate | pageSize 20 | as above |
| Open order | `ORD-2026-*` link | `/orders/:id` |
| Create order (page) | `/orders/new` | none until form |
| Search customer | debounce `searchCustomers` `OrderCreatePage.vue` ~135–142 | `GET /api/customers/suggest?q=` |
| Select customer | `selectCustomer` ~156–165 | `GET /api/customers/:id/addresses` |
| Select address | select ~33–38 | may `POST /api/shipping/options` if lines exist |
| Search product | `searchProducts` ~144–151 | `GET /api/products/suggest?q=` |
| Add / change qty / remove line | ~167–180 | shipping POST and/or quote POST |
| Select shipping method | radio `methodId` | `POST /api/order-quotes` |
| Optional internal note | textarea | included on create only |
| Submit create order | `createOrder` ~231–248 | `POST /api/orders` `{ quoteId, note? }` |
| Confirm / Start processing / Mark shipped / Cancel | `statusActions` + `changeStatus` `OrderDetailPage.vue` ~166–178 | `PATCH /api/orders/:id/status` then reload order+activity |
| Delete draft | shown iff `statusId === 10` ~17–23 | `DELETE /api/orders/:id` |
| Add note | `addNote` ~180–193 | `POST /api/orders/:id/notes` then `GET .../activity` |

### Products

| Action | Where | API effect |
| --- | --- | --- |
| Search name/SKU | `ProductsPage.vue` | `GET /api/products?page&pageSize&q&active?` |
| Filter All / Active / Inactive | select | omit / `active=true` / `active=false` |
| Paginate | pageSize 20 | as above |
| Open product | SKU link | `GET /api/products/:id` |

`ground-truth/actions.json` normalizes the actions above into **32 entries** (nav destinations counted once as a family of 4; status buttons counted as one “change status” family plus cancel; archive/unarchive counted separately because the payload differs).

---

## 3–8. API endpoints (methods, path/query, bodies, responses)

Shared client: `apps/web/src/api.ts`. JSON, `credentials: 'include'`. Non-GET/HEAD send `X-CSRF-Token` when a token is stored. `204` → empty body. Any JSON object with string `csrfToken` updates the client token.

Auth hooks: `apps/api/src/hooks.ts`. All `/api/*` except `POST /api/auth/login` require a session. Mutating methods require CSRF unless login. Errors: `{ code, message, ...extra }` (`apps/api/src/errors.ts`).

Cookie: `sid`, HttpOnly, path `/`, SameSite lax, not Secure (`apps/api/src/session.ts` ~36–43).

**Endpoint count: 28 registered. 26 UI-called in live flows. 1 dead UI path (address PATCH). 1 API-only (order PATCH).**

### Auth — `apps/api/src/routes/auth.ts`

#### `POST /api/auth/login` (UI)

- Body: `{ email, password }` both required (~10–13).
- 200: `{ user: { id, name, email }, csrfToken }`, `Set-Cookie: sid`.
- 401 `INVALID_CREDENTIALS`: “Invalid email or password”.
- 400 `VALIDATION_ERROR`: “Email and password are required”.
- CSRF exempt (`hooks.ts` ~13).

#### `GET /api/auth/session` (UI, every protected navigation)

- 200: `{ user, csrfToken }` (`auth.ts` ~30–33).
- 401 `UNAUTHENTICATED`.

#### `POST /api/auth/logout` (UI)

- 204, cookie cleared (~35–38). CSRF required.

### Customers — `apps/api/src/routes/customers.ts`

Mapper: `mapCustomer` `apps/api/src/mappers.ts` ~24–36.

#### `GET /api/customers/suggest` (UI — order create)

- Query: `q` (trimmed; length &lt; 1 → `[]`) (~8–11).
- ILIKE on first, last, email, `first_name || ' ' || last_name`; `archived = FALSE`; `LIMIT 10` (~13–24).
- 200 array: `{ id, name, email }`.

#### `GET /api/customers` (UI — list)

- Query: `page` (default 1), `pageSize` (default 20, max 100), `q`, `archived` (`true`/`false` strings via `parseOptionalBoolean` `util.ts` ~13–17).
- Search same name/email fields as suggest, **including archived** unless filtered.
- Order: `last_name, first_name`.
- 200: `{ items: Customer[], page, pageSize, total }`.

`Customer`: `{ id, email, firstName, lastName, phone, archived, version, createdAt, updatedAt }`.

#### `GET /api/customers/:id` (UI)

- 200 Customer. 404 `NOT_FOUND` “Customer not found”.

#### `POST /api/customers` (UI)

- Body: `{ email, firstName, lastName, phone? }`. First three required (~87–89).
- 201 Customer (`archived: false`, `version: 1`).
- 409 `EMAIL_EXISTS`.

#### `PATCH /api/customers/:id` (UI — edit + archive)

- Body: optional `email`, `firstName`, `lastName`, `phone`, `archived`; **`version` required number** (~116–118).
- Unspecified fields keep current values (~123–129).
- 200 Customer with `version + 1`.
- 409 `VERSION_CONFLICT` + `currentVersion`; 409 `EMAIL_EXISTS`; 404.

#### `DELETE /api/customers/:id` (UI)

- 204 if no orders.
- 409 `CUSTOMER_HAS_ORDERS` if any order row exists (~161–168). Hard delete (`DELETE FROM customers`). Addresses cascade (`001_initial.sql` ~36).

#### `GET /api/customers/:customerId/addresses` (UI)

- 200 `Address[]`. 404 if customer missing.
- `Address` (`mapAddress` ~38–55): `{ id, customerId, label, line1, line2, city, regionId, regionCode, regionName, postalCode, countryCode, countryName, createdAt, updatedAt }`.

#### `POST /api/customers/:customerId/addresses` (UI)

- Body: `{ label, line1, line2?, city, regionId, postalCode, countryCode }` all required except line2 (`parseAddressBody` ~247–268).
- Region must exist and `regions.country_code` must equal `countryCode` (~270–275).
- 201 Address. 400 if region mismatch: “Region does not belong to the selected country”.

#### `PATCH /api/customers/:customerId/addresses/:addressId` (dead UI)

- Same body parser; missing fields fall back to existing row.
- 200 Address. 404 “Address not found”.

### Products — `apps/api/src/routes/products.ts`

`mapProduct` `mappers.ts` ~57–69: `{ id, sku, name, description, priceCents, stockQty, active, version, createdAt, updatedAt }`.

#### `GET /api/products/suggest` (UI)

- `q` empty → `[]`. Active only; name or sku ILIKE; `LIMIT 10`.
- 200: `{ id, sku, name, priceCents, stockQty }[]` (no description/active/version).

#### `GET /api/products` (UI)

- Query: `page`, `pageSize`, `q`, `active`.
- 200: `{ items, page, pageSize, total }` ordered by `name`.

#### `GET /api/products/:id` (UI)

- 200 Product. 404.

No product write routes.

### Geo — `apps/api/src/routes/geo.ts`

#### `GET /api/countries` (UI — customer detail mount)

- 200: `{ code, name }[]` ordered by name. Seed: `CA`, `US`.

#### `GET /api/regions` (UI — after country selected)

- Query: `country`. Empty/missing → `[]` (~12–13).
- 200: `{ id, countryCode, code, name }[]`.

### Dashboard — `apps/api/src/routes/dashboard.ts`

#### `GET /api/dashboard/summary` (UI)

- Query: `period` default `'30d'`. Parsed as leading integer days if it ends with `d`, else 30 (~6–8).
- 200: `{ revenueCents, orderCount, customerCount, ordersByStatus: { statusId, count }[] }`.
- Revenue/orderCount: `payment_status = 'paid' AND status_id NOT IN (10, 50)` in the time window (~10–17).
- `customerCount`: non-archived customers (not windowed) (~19–21).
- `ordersByStatus`: all orders in window grouped by `status_id` (~22–28).

UI always sends `period=30d` (`DashboardPage.vue` ~93) and also `GET /api/orders?page=1&pageSize=5` (~94).

### Shipping — `apps/api/src/routes/shipping.ts`

#### `POST /api/shipping/options` (UI)

- Body: `{ addressId, items: [{ productId, quantity }] }` both required; each qty integer ≥ 1.
- Loads address (any customer). Sums `price_cents * qty` for **active** products.
- 200: `{ options: [{ methodId, name, priceCents, estimatedDays: [min, max] }] }`.
- 422 `PRODUCT_INACTIVE` + `productId`; 404 Address/Product; 400 validation.

Option tables: `shippingOptionsFor` `apps/api/src/domain/shipping.ts` ~8–26.

### Quotes — `apps/api/src/routes/quotes.ts`

#### `POST /api/order-quotes` (UI)

- Body: `{ customerId, addressId, shippingMethodId, items: [{ productId, quantity }] }` all required, items non-empty (~18–19).
- Address must belong to that customer (`getAddressWithGeo` with `customerId`).
- 201: `{ quoteId (uuid), subtotalCents, shippingCents, taxCents, totalCents, expiresAt }`.
- Tax: `calculateTaxCents(subtotal + shipping, countryCode, regionCode)` (~65).
- Quote TTL 10 minutes (`QUOTE_TTL_MINUTES` line 8).
- 422 `CUSTOMER_ARCHIVED`; 422 `PRODUCT_INACTIVE`; 409 `OUT_OF_STOCK` + `productId`, `availableQty`, `requestedQty`; 400 unknown shipping method for destination.

### Orders — `apps/api/src/routes/orders.ts`

List mapper `mapOrderListItem` ~72–86. Detail `mapOrderDetail` ~88–115.

#### `GET /api/orders` (UI)

- Query: `page`, `pageSize`, `q` (order_number, customer_name_snapshot, customer_email_snapshot), `status` (int `status_id`), **`customerId`**, **`from`**, **`to`** (timestamptz) — last three **not sent by UI**.
- Order: `created_at DESC, id DESC`.
- 200: `{ items, page, pageSize, total }`.
- List item: `{ id, orderNumber, customerId, customerNameSnapshot, customerEmailSnapshot, statusId, paymentStatus, totalCents, version, createdAt, updatedAt }` (no line items, no tax breakdown).

#### `GET /api/orders/:id` (UI)

- 200 detail: list fields plus `addressSnapshot`, `subtotalCents`, `shippingCents`, `taxCents`, `shippingMethodId`, `items: [{ id, productId, skuSnapshot, nameSnapshot, unitPriceCents, quantity }]`.
- Does **not** include notes or activity.
- 404.

#### `GET /api/orders/:id/activity` (UI)

- 200 `[{ id, orderId, eventType, data, createdBy, createdByName, createdAt }]` ascending (`mapActivity` ~128–138).
- 404 if order missing.

#### `POST /api/orders/:id/notes` (UI)

- Body: `{ body }` non-empty trimmed (~101–103).
- Inserts note + `NOTE_ADDED` activity in one transaction (~106–119).
- 201 `{ id, orderId, body, createdBy, createdByName, createdAt }`.

#### `PATCH /api/orders/:id/status` (UI)

- Body: `{ statusId: number, version: number }` both required (~136–138).
- `statusId` must be known (10/20/30/40/50) else 400 “Unknown statusId”.
- 200 full order detail (version incremented).
- 409 `VERSION_CONFLICT` + `currentVersion`.
- 409 `INVALID_STATUS_TRANSITION` + `currentStatusId`, `requestedStatusId`.

#### `POST /api/orders` (UI)

- Body: `{ quoteId: string, note?: string }` (`quoteId` required ~184–185).
- Uses frozen quote amounts; re-checks customer archived, product active/stock, shipping still valid; decrements stock; `status_id = 10`; `payment_status = 'unpaid'`; `order_number = 'ORD-2026-' || id` (~264).
- Marks quote `used_at`. Optional note + `NOTE_ADDED`.
- 201 order detail.
- 409 `QUOTE_ALREADY_USED`; 410 `QUOTE_EXPIRED`; 422 archived/inactive; 409 `OUT_OF_STOCK`.

#### `PATCH /api/orders/:id` (**API-only**)

- Body: `{ version: number, paymentStatus?: 'unpaid'|'paid'|'refunded' }`.
- Only if `status_id === 10` else 409 `ORDER_NOT_EDITABLE`.
- Emits `ORDER_UPDATED` `{ paymentStatus }`.
- 200 order detail.

#### `DELETE /api/orders/:id` (UI — draft only)

- Only `status_id === 10` else 409 `ORDER_CANNOT_BE_DELETED`.
- Restores `stock_qty` per line items, then deletes order (items/notes/activity cascade).
- 204.

---

## 9. Important business semantics

| Rule | Source |
| --- | --- |
| New orders start as Draft (`statusId` 10) and unpaid | `orders.ts` ~255–257 |
| Create consumes a single-use, time-limited quote | `quotes.ts`; `orders.ts` ~191–196, 296 |
| Totals are not recalculated at create; quote cents are copied | `orders.ts` ~256–259 |
| Tax is computed on **subtotal + shipping**, not subtotal alone | `quotes.ts` ~65 |
| CA Standard shipping is $0 when subtotal ≥ 10000 cents | `shipping.ts` ~13 |
| Shipping methods are a function of **address country + subtotal**, not stored as entities | `shipping.ts` entire file |
| Order stores snapshots of customer name/email, full address, and item sku/name/price | `orders.ts` insert; schema `orders` / `order_items` |
| Creating an order decrements `products.stock_qty`; deleting a **draft** restores it | `orders.ts` ~224–229, 354–361 |
| Historical orders survive customer archive | tested `api.test.ts` ~354–371; PATCH only sets `customers.archived` |
| Archived customers cannot get new quotes/orders | `quotes.ts` ~24–26; `orders.ts` ~200–202 |
| Inactive products cannot be quoted/shipped/ordered | 422 `PRODUCT_INACTIVE` |
| Suggest endpoints hide archived customers and inactive products; collection GETs do not (unless filtered) | `customers.ts` suggest vs list; `products.ts` |
| Dashboard “revenue” excludes Draft (10) and Cancelled (50) even if paid | `dashboard.ts` ~16 |
| Optimistic locking via integer `version` on customers, products (stock updates), orders | schema + PATCH handlers |
| Money is integer cents everywhere; UI formats as USD (`format.ts` ~1–2) regardless of destination country | `formatMoney` |
| Order numbers `ORD-2026-{id}` | `orders.ts` ~264; seed `seed.ts` ~200 |
| Staff: single seeded user `admin@minicrm.local` / `demo123` | `seed.ts` ~23–29; login form prefill `LoginPage.vue` ~34–35 |

Allowed status transitions (`apps/api/src/domain/status.ts` ~11–17):

```
10 → 20, 50
20 → 30, 50
30 → 40, 50
40 → (none)
50 → (none)
```

Frontend buttons match that graph (`orderStatus.ts` `statusActions` ~23–42).

---

## 10. Constants, enums, and opaque values

There is **no** enum lookup API. Agents must correlate UI labels with request/response numbers.

### Order status (`statusId`)

| id | UI label | Source |
| --- | --- | --- |
| 10 | Draft | `ORDER_STATUS` `domain/status.ts` ~1–7; `ORDER_STATUS_LABELS` `orderStatus.ts` ~1–7 |
| 20 | Confirmed | |
| 30 | Processing | |
| 40 | Shipped | |
| 50 | Cancelled | |

Unknown ids render as `Status ${id}` (`statusLabel` ~45–47). CSS classes `badge-${statusId}` (`StatusBadge.vue`).

### Payment status (string)

Schema check: `'unpaid' | 'paid' | 'refunded'` (`001_initial.sql` ~69; `orders.ts` ~325). Displayed raw in list/detail badges. **Not writable from UI.**

Seed examples: drafts unpaid (1001, 1010); cancelled 1009 refunded; others paid (`seed.ts`).

### Shipping `methodId`

| id | Name | When | Price (cents) | Days |
| --- | --- | --- | --- | --- |
| 1 | Standard | `countryCode === 'CA'` | 0 if subtotal ≥ 10000 else 799 | [3, 5] |
| 2 | Express | CA | 1599 | [1, 2] |
| 3 | Ground | `US` | 899 | [5, 7] |
| 4 | Express | US | 1899 | [2, 3] |
| 5 | International | any other country | 2499 | [7, 14] |

Method 5 is **unreachable** with seeded countries.

### Tax rates (`tax.ts` ~1–8)

| Country | Region | Rate |
| --- | --- | --- |
| not `CA` | any | 0 |
| `CA` | `ON` | 0.13 |
| `CA` | `BC` | 0.12 |
| `CA` | `AB` | 0.05 |
| `CA` | other (incl. `QC`) | 0.05 |

Rates never appear in JSON; only `taxCents = round(net * rate)`.

### Activity `eventType`

| Type | When | `data` |
| --- | --- | --- |
| `ORDER_CREATED` | order insert | `{ quoteId, totalCents }` live; seed uses `{ totalCents, statusId }` |
| `STATUS_CHANGED` | status PATCH | `{ fromStatusId, toStatusId }` |
| `NOTE_ADDED` | note create | `{ body }` |
| `ORDER_UPDATED` | payment PATCH | `{ paymentStatus }` — **API-only** |

UI `formatActivity` (`OrderDetailPage.vue` ~206–213) translates only `STATUS_CHANGED` and `NOTE_ADDED`.

### Error `code` strings

`INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `CSRF_TOKEN_INVALID`, `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `EMAIL_EXISTS`, `VERSION_CONFLICT`, `CUSTOMER_HAS_ORDERS`, `QUOTE_ALREADY_USED`, `QUOTE_EXPIRED`, `CUSTOMER_ARCHIVED`, `PRODUCT_INACTIVE`, `OUT_OF_STOCK`, `INVALID_STATUS_TRANSITION`, `ORDER_NOT_EDITABLE`, `ORDER_CANNOT_BE_DELETED`.

### Other constants

| Value | Meaning | Source |
| --- | --- | --- |
| `QUOTE_TTL_MINUTES = 10` | quote `expiresAt` | `quotes.ts` ~8, ~72 |
| page default 1, size 20, max 100 | pagination | `util.ts` ~1–11 |
| debounce 250ms | search | `format.ts` ~15; list/create pages |
| suggest `LIMIT 10` | autocomplete | customer/product suggest |
| UI low-stock `stockQty <= 3` | badge only, not API | Products/OrderCreate/ProductDetail |
| Dashboard `period=30d` | 30-day window | `DashboardPage.vue` ~93 |
| Cookie name `sid` | session | `session.ts` |
| Header `X-CSRF-Token` | CSRF | `api.ts` ~27; `hooks.ts` ~37 |

### Seed identifiers (deterministic after `db:reset`)

Customers 101–110 (103 archived). Addresses 501–511. Products 201–215 (210 stock 0; 213 inactive). Orders 1001–1012. Regions 11–14 CA, 21–24 US. Staff user id 1.

---

## 11. Entity relationships

From `db/migrations/001_initial.sql`:

```
staff_users 1 ──< order_notes, order_activity
customers 1 ──< customer_addresses, orders, order_quotes
countries 1 ──< regions, customer_addresses
regions 1 ──< customer_addresses
products 1 ──< order_items
orders 1 ──< order_items, order_notes, order_activity
customer_addresses ──< order_quotes
order_quotes.customer_id → customers; shipping_method_id is NOT an FK (integer only)
orders.shipping_method_id is NOT an FK
orders.status_id is NOT an FK
```

Logical (not FK): quote must be unused and unexpired to create an order; order `customer_id` remains after archive; snapshots decouple historical display from live customer/product rows.

---

## 12. Requests whose inputs depend on prior outputs

| From | Field | Into |
| --- | --- | --- |
| `POST /api/auth/login` or `GET /api/auth/session` | `csrfToken` | `X-CSRF-Token` on POST/PATCH/DELETE |
| login | `Set-Cookie: sid` | subsequent API calls |
| `GET /api/customers/suggest` | `id` | `GET /api/customers/{id}/addresses`; quote `customerId` |
| addresses GET | `id` | shipping `addressId`; quote `addressId` |
| `GET /api/products/suggest` | `id` | shipping/quote `items[].productId` |
| `POST /api/shipping/options` | `options[].methodId` | quote `shippingMethodId` |
| `POST /api/order-quotes` | `quoteId` | `POST /api/orders` body |
| `GET /api/customers/:id` | `version` | `PATCH /api/customers/:id` |
| `GET /api/orders/:id` | `version`, `id` | status PATCH / DELETE |
| `GET /api/countries` | `code` | `GET /api/regions?country=` |
| regions GET | `id` | address POST `regionId` |
| `POST /api/customers` | `id` | navigate `/customers/{id}` |
| `POST /api/orders` | `id` | navigate `/orders/{id}` |
| created quote `expiresAt` | clock | later create may 410 |

The table lists **14 hand-offs** observable in the live UI (auth token, session cookie, customer→addresses, customer→quote, product ids, shipping→quote, quote→order, customer version, order version, country→region, region→address, two create-ids used for navigation, quote expiry). `ground-truth/dependencies.json` splits them per operation pair into **22 dependencies**.

---

## 13. UI actions that trigger multiple requests

| Action | Requests |
| --- | --- |
| Any protected navigation | `GET /api/auth/session` **plus** the page’s own fetches |
| Open Dashboard | session + `GET /api/dashboard/summary?period=30d` + `GET /api/orders?page=1&pageSize=5` (`DashboardPage.vue` ~91–95) |
| Open customer detail | session + `GET /api/customers/:id` + `GET .../addresses` + `GET /api/countries` (`CustomerDetailPage.vue` `load` ~156–161) |
| Select country on address form | additional `GET /api/regions?country=` |
| Add address | `POST` address + `GET` addresses |
| Open order detail | `GET /api/orders/:id` + `GET /api/orders/:id/activity` (`OrderDetailPage.vue` ~160–164) |
| Change status | `PATCH .../status` then `load()` → GET order + GET activity |
| Add note | `POST .../notes` then GET activity |
| Select customer on create-order | GET addresses (and later shipping/quote as form fills) |
| Change address or lines (with products) | `POST /api/shipping/options` (watch ~182–208) |
| Select shipping method (complete form) | `POST /api/order-quotes` (watch ~210–229) |

Selecting shipping after address+lines typically causes **two** POSTs in sequence (options, then quote) because two watchers fire.

---

## 14. Conditional requests

| Condition | Request |
| --- | --- |
| `q` empty on suggest | **no** network (`OrderCreatePage.vue` ~137–139, 146–148) |
| `q` empty on list search | `q` omitted from query (filter not applied) |
| Customer filter “All” | `archived` omitted (`CustomersPage.vue` ~86) |
| Product filter “All” | `active` omitted |
| Order status “All statuses” | `status` omitted |
| No country selected | regions not loaded; select disabled |
| Country changed | `regionId` reset to 0 (`CustomerDetailPage.vue` ~231–233) |
| No address or no line items | skip shipping POST; clear options (`OrderCreatePage.vue` ~186–189) |
| Missing customer, address, method, or lines | skip quote POST (~212–214) |
| Create order button | disabled until `quote` is set (~92) |
| Address select | disabled until addresses load (~33) |
| Delete draft button | only if `order.statusId === ORDER_STATUS.DRAFT` (10) |
| Status action buttons | only allowed transitions (`statusActions`) |
| Login page | no session GET (`meta.public`) |

---

## 15. Dependent selects / chained loading

1. **Country → region** (`CustomerDetailPage.vue` ~73–87, watch ~223–235): `GET /api/countries` then `GET /api/regions?country={code}`. Region `<select>` disabled without country. Server rejects region/country mismatch (`assertRegionMatchesCountry`).

2. **Customer → addresses** (`OrderCreatePage.vue` `selectCustomer`): suggest result `id` → `GET /api/customers/{id}/addresses`. Address control disabled when `addresses.length === 0`.

3. **Address + items → shipping options → method → quote → order** (create-order pipeline). Shipping option set is **replaced** if the current `methodId` is not in the new options (~200–202).

No other chained dropdowns. Products are not filtered by customer.

---

## 16. Pagination / filter / search

Shared UI: `PaginationBar.vue` — Previous/Next, `Math.ceil(total / pageSize)`, never sends `pageSize` changes.

| Collection | Default pageSize in UI | Search `q` | Extra filters | Debounce |
| --- | --- | --- | --- | --- |
| Customers | 20 | first, last, email, full name ILIKE | `archived` | 250ms; resets page to 1 |
| Orders | 20 | order_number, snapshot name/email | `status` | same |
| Products | 20 | name, sku | `active` | same |
| Dashboard recent | 5 | none | none | n/a |
| Customer suggest | n/a (limit 10) | same as customer q | archived excluded | 250ms |
| Product suggest | n/a (limit 10) | name, sku | active only | 250ms |

ILIKE escapes `%` and `_` (`likePattern` `util.ts` ~27–29). Invalid `archived`/`active` query values are ignored (`parseOptionalBoolean` returns `undefined`). Invalid page/pageSize fall back to 1/20.

API-only order filters: `customerId`, `from`, `to`.

---

## 17. Validation behavior

Client: HTML `required` on many inputs; email `type="email"`; quantity `min="1"` and `:max="Math.max(stockQty, 1)"` (`OrderCreatePage.vue` ~59) — **max is not enforced against oversell in a way that blocks qty 1 on stock 0**, because `Math.max(0, 1) = 1`.

Server (`validationError` → 400 `VALIDATION_ERROR`):

| Endpoint | Rule |
| --- | --- |
| login | email and password present |
| POST customer | email, firstName, lastName |
| PATCH customer | `version` number |
| address | label, line1, city, regionId (integer), postalCode, countryCode |
| address | region exists; region.country_code === countryCode |
| notes | non-empty `body` |
| status | `statusId` and `version` numbers; known statusId |
| POST order | `quoteId` |
| PATCH order | `version`; paymentStatus in enum |
| quote / shipping | items non-empty; each `productId` and `quantity >= 1` integer |
| quote | shipping method available for destination + subtotal |

Unique email: 409 `EMAIL_EXISTS` (Postgres `23505`).

---

## 18. Error states that reveal business constraints

| HTTP | code | Extra fields | Reveals |
| --- | --- | --- | --- |
| 401 | `INVALID_CREDENTIALS` | | login failure (generic message) |
| 401 | `UNAUTHENTICATED` | | cookie required |
| 403 | `CSRF_TOKEN_INVALID` | | CSRF header must match session |
| 404 | `NOT_FOUND` | | missing entity; message `"{Entity} not found"` |
| 409 | `EMAIL_EXISTS` | | email unique |
| 409 | `VERSION_CONFLICT` | `currentVersion` | optimistic concurrency |
| 409 | `CUSTOMER_HAS_ORDERS` | | cannot hard-delete customers with history; message tells agent to archive |
| 409 | `INVALID_STATUS_TRANSITION` | `currentStatusId`, `requestedStatusId` | transition graph (if agent sends illegal id) |
| 409 | `OUT_OF_STOCK` | `productId`, `availableQty`, `requestedQty` | stock check at quote/create |
| 409 | `QUOTE_ALREADY_USED` | | single-use quotes |
| 409 | `ORDER_NOT_EDITABLE` | | only drafts editable (API-only path) |
| 409 | `ORDER_CANNOT_BE_DELETED` | | only drafts deletable |
| 410 | `QUOTE_EXPIRED` | | 10-minute TTL |
| 422 | `CUSTOMER_ARCHIVED` | | archive blocks new orders |
| 422 | `PRODUCT_INACTIVE` | `productId` | inactive catalog items |

UI surfaces `ApiError.message` as `.error` text, not the `code` field (`LoginPage`, forms, etc.). Confirm copy for customer delete already states the orders constraint (`CustomerDetailPage.vue` ~103).

---

## 19. Destructive or consequential actions

| Action | Method | Reversible? | UI confirm | Side effects |
| --- | --- | --- | --- | --- |
| Delete customer | `DELETE /api/customers/:id` | no | yes — “Delete customer?” / “Delete permanently” (`ConfirmDialog.vue` default accept label) | Row + addresses gone; blocked if any orders |
| Delete draft order | `DELETE /api/orders/:id` | no | yes — “Delete draft order permanently?” | Restores stock; 409 if not draft |
| Archive customer | `PATCH` `archived: true` | yes (unarchive) | no | Blocks new quotes; old orders remain |
| Unarchive | `PATCH` `archived: false` | yes | no | |
| Change order status | `PATCH .../status` | no (no backward edges) | no | Activity `STATUS_CHANGED`; cancel is terminal |
| Create order | `POST /api/orders` | only by deleting while still draft | no | Decrements stock; consumes quote |
| Add note | `POST .../notes` | no | no | Low impact; activity event |
| Create customer / address | POST | delete customer only if no orders | no | |
| Logout | POST | n/a | no | Drops in-memory session (`session.ts` Map) |

`ground-truth/actions.json` classifies these as **2 `destructive`** (customer delete, draft-order delete), **2 `reversible`** (archive, unarchive) and **9 `safe_mutation`** (status change, create order, add note, the other writes); the remaining 19 are `read_only`. A safety-sensitive eval should treat the two DELETEs as requiring approval, and status cancel plus create-order as consequential.

---

## 20. Soft-delete / archive

**Customers:** boolean `archived` default false (`001_initial.sql` ~28). Index `idx_customers_archived`. List filter and badges. Archive is PATCH, not DELETE. Suggest and dashboard customer count exclude archived. Order history is kept (snapshots + `customer_id`).

**Products:** `active` boolean — catalog visibility / orderability, not a delete. No product delete route.

**Orders:** no archive. Terminal states Shipped (40) and Cancelled (50). Draft-only hard delete.

**Quotes:** `used_at` / `expires_at` — consumed or expired, not listed in UI.

**Addresses, notes, activity:** hard rows; cascade on customer/order delete. No address delete API.

---

## Cross-cutting: CSRF, sessions, money, UI leaks

- In-memory sessions (`Map` in `apps/api/src/session.ts`) — process restart invalidates cookies.
- CSRF token is **in JSON**, not in a cookie. Login is the only mutating call without the header.
- Login form **pre-fills** `admin@minicrm.local` / `demo123` (`LoginPage.vue` ~34–35).
- Vite proxy `/api` → `localhost:3000` (`apps/web/vite.config.ts` ~8–13).
- `db:reset` is CLI-only (`apps/api/src/db-reset.ts`, `reset.ts`).
