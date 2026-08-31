Extract `semantic_facts` of kind `validation` and `auth`. Return a JSON
array. No wrapper, no markdown, no commentary.

One atomic fact per entry. Cookie, CSRF header, session probe, and a
field-level 422 are different facts.

`value` is a literal token you saw (`sid`, `X-CSRF-Token`, an error
`code` from the body) or an object whose keys come from the published
`semanticFactValue` fragment (`csrf`, `required`, `type`, …). Use those
keys, not prose.

Subjects for cookies and headers: `cookie:sid`, `header:X-CSRF-Token`,
`Set-Cookie:sid`. Never `GET /api/auth/session.response.csrfToken` and
never a dotted response path. Prefixes are case-sensitive except HTTP
header names. Emit a cookie fact only when the **cookie name** itself
appears in evidence; if the header was redacted and you only saw a JSON
`csrfToken` field, do not invent `cookie:sid`.

Error-code facts use `kind: validation`. The subject is the **operation
that returned `code`**, not a nearby field name — except uniqueness on a
named field:

- `INVALID_CREDENTIALS` → `POST /api/auth/login` / `"INVALID_CREDENTIALS"`
- `OUT_OF_STOCK` / `PRODUCT_INACTIVE` → `POST /api/order-quotes`
- `INVALID_STATUS_TRANSITION` → `PATCH /api/orders/{}/status`
- `EMAIL_EXISTS` → `customer.email` (the only field-level error code)

Do not put those codes on `auth.credentials`, `product.stockQty`, or any
other field just because the body mentions it. Do not also emit the same
code as `business_constraint`.

CSRF: JSON bodies carry `csrfToken` even when the request header is
redacted. From that field emit:

- `kind: auth`, `subject: header:X-CSRF-Token`, `value: "X-CSRF-Token"`
- `kind: auth`, `subject: POST /api/auth/login`, `value: { "csrf": false }`

Do **not** emit `GET /api/auth/session` / `"csrfToken"` as a fact.

Every entry needs a non-empty `evidence` array (`cookie`, `header`,
`network_request`, `network_response`). Only what was observed. Do not
describe auth a typical app would have.
