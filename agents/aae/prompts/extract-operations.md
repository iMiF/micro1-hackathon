Extract `operations` from the evidence digest. Return a JSON array of
operation objects. No wrapper, no markdown, no commentary.

Each operation is one `METHOD` + path. Method upper-case. Path with
concrete ids and `{name}` / `:name` placeholders erased to `{}` (or a
published placeholder name — the name is not scored). Include `parameters`
(location, name, type; a query parameter the UI always sends is not
therefore `required`), `request_schema` and `response_schema` when bodies
were seen, `success_status`, `error_responses` when error statuses were
seen, and a non-empty `evidence` array.

Copy **every** name from that operation's digest `queryParameters` into
`parameters` (query location). Omitting `q` or `active` because you did
not type them is a miss — the digest already lists them. Path parameters
are the `{}` segments.

One atomic fact per entry: one path is one operation. Distinct routes must
not collapse because a placeholder was erased — `/api/orders/{}/status` and
`/api/orders/{}` are different.

Every entry needs evidence (`network_request` / `network_response`) citing
method, path, status you actually saw. No evidence → drop the entry.

Only what was observed. Do not invent endpoints a CRM usually has.

## Matching grammar (paths)

Body fields later use `$.field` and `$.items[]`. That is not this section.
Here the unit is `METHOD /normalized/path`.
