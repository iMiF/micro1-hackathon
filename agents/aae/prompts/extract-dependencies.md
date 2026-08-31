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

Every entry needs a non-empty `evidence` array. Only edges you observed
(a value from one response appearing on a later request). Do not invent
the usual CRM graph.
