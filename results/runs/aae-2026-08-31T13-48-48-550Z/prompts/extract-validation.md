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
header names.

Error-code facts use `kind: validation`. The subject is the **field**
the code names (`customer.email`), not the HTTP operation. Example:
`EMAIL_EXISTS` → `kind: validation`, `subject: customer.email`,
`value: "EMAIL_EXISTS"`. Do not also emit the same code as
`business_constraint` on `POST /api/customers`.

Every entry needs a non-empty `evidence` array (`cookie`, `header`,
`network_request`, `network_response`). Only what was observed. Do not
describe auth a typical app would have.
