Extract `operations` from the evidence digest. Return a JSON array of
operation objects. No wrapper, no markdown, no commentary.

Each operation is one `METHOD` + path. Method upper-case. Path with
concrete ids and `{name}` / `:name` placeholders erased to `{}` (or a
published placeholder name — the name is not scored). Include `parameters`
(location, name, type; a query parameter the UI always sends is not
therefore `required`), `request_schema` and `response_schema` when bodies
were seen, `success_status`, `error_responses` when error statuses were
seen, and a non-empty `evidence` array.

Also fill three display fields. They are **not scored**. Omit a field rather
than guessing:

- `summary` — one short sentence from what was observed (button label, page
  heading, what the request did). Not a product-brochure line.
- `authentication` — how this call was authenticated, from traffic: `none`,
  `session-cookie`, `session-cookie+csrf`, or the cookie / header name you
  actually saw. Login itself is `none`.
- `confidence` — a number in `[0, 1]`. One network observation ≈ 0.6; the
  same call seen on more than one object, or with a matching UI label, ≈ 0.9.
  A blocked destructive click with no HTTP is ≈ 0.5.

Copy **every** name from that operation's digest `queryParameters` into
`parameters` (query location). Omitting `q` or `active` because you did
not type them is a miss — the digest already lists them. Path parameters
are the `{}` segments.

One atomic fact per entry: one path is one operation. Distinct routes must
not collapse because a placeholder was erased — `/api/orders/{}/status` and
`/api/orders/{}` are different.

Evidence may be `network_request` / `network_response` **or** `ui_action`
when the digest `blockedActions` (or a blocked click in the timeline)
records a destructive intent the harness never sent. A blocked `Delete` /
`Delete draft` click **is** an observed operation: emit
`DELETE /api/orders/{}` or `DELETE /api/customers/{}` with path parameter
`id` (`location: path`, `type: integer`, `required: true`) and
`ui_action` evidence citing the button label. Do **not** invent HTTP 409
or other error_responses for a request that never left the client.

Do **not** emit DELETE from a CRM prior, from a button named `Delete Me`
(that is a customer display name), or from any label that is not a blocked
Delete / Delete draft (or live DELETE traffic). No blocked/traffic → no
DELETE.

Every entry needs a non-empty `evidence` array. No evidence → drop the
entry. Only what was observed. Do not invent endpoints a CRM usually has.

## Matching grammar (paths)

Body fields later use `$.field` and `$.items[]`. That is not this section.
Here the unit is `METHOD /normalized/path`.
