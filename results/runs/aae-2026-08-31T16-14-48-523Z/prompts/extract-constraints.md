Extract `semantic_facts` of kind `business_constraint`. Return a JSON
array. No wrapper, no markdown, no commentary.

One atomic fact per entry. Each error `code` you saw, each condition that
produced a 409/422, is its own fact. Do not pack stock, version, and
delete-guards into one row.

`value` is the error `code` token from the body (`QUOTE_ALREADY_USED`,
`CUSTOMER_HAS_ORDERS`, `ORDER_CANNOT_BE_DELETED`, …), or an object whose
keys come from the published `semanticFactValue` fragment (`effect`,
`requires`, …). Use those keys, not prose.

Do **not** emit `EMAIL_EXISTS`, `OUT_OF_STOCK`, `PRODUCT_INACTIVE`, or
`INVALID_CREDENTIALS` here — those are `validation` facts (field
`customer.email` for uniqueness; the failing operation for the others).
Do not invent a constraint you did not see rejected.

These facts start as hypotheses: one observation is not a law. Still
record what you saw, with evidence.

Every entry needs a non-empty `evidence` array citing the failing request
(method, path, status, and the `code` if present). Only what was observed.
