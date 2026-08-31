Extract `dependencies`. Return a JSON array. No wrapper, no markdown, no
commentary.

One atomic fact per entry. Each source-field → target-field edge is its
own dependency.

Required fields: `source_operation`, `target_operation`. Optional:
`source_field`, `target_field`, `kind` (`auth` | `lookup` | `concurrency`
| `payload` | `filter`), `description`, `evidence`.

Operations: `METHOD /normalized/path`, or `*` as `target_operation` when
the artifact is sent on every subsequent matching request (session cookie,
CSRF) — not when you observed one consumer.

Field references, prefixes case-sensitive except HTTP header names:
`header:`, `cookie:`, `Set-Cookie:`, `query.` for query-string parameters,
`$.` JSONPath for bodies. Arrays: `$.items[].productId` (write `[]`, not
`[0]` or `[*]`). A root `$[]` / `$[*]` is the same as `$.`. A bare `{id}`
means the path parameter; the placeholder name is not scored.

Do **not** emit `GET /api/{list}` + `$.items[].id` → `GET /api/{}/` (or
PATCH / notes). The id for detail / PATCH / notes is taken from
`GET /api/.../{}` or from `suggest` (`$[].id`), never from the list page.

CSRF: if a JSON body contained `csrfToken` (login or session), emit
`POST /api/auth/login` / `GET /api/auth/session` + `$.csrfToken` → `*` +
`header:x-csrf-token` (header name is case-insensitive). Cookie edges
only if the cookie **name** appeared in evidence.

If the timeline shows `GET .../activity` after `POST .../notes` on the
same order, emit one notes→activity edge (`{id}` → `{id}`).

Every entry needs a non-empty `evidence` array. Only edges you observed
(a value from one response appearing on a later request). Do not invent
the usual CRM graph.
