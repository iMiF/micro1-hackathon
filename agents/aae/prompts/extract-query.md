Extract `semantic_facts` of kind `query_semantics` and `derived_value`.
Return a JSON array. No wrapper, no markdown, no commentary.

One atomic fact per entry. Each query parameter is its own subject. A
derived total, a tax, a search field-set — each is its own fact. Packing
several parameters into one `value` is one false positive.

Do **not** emit a `derived_value` for snapshot fields (`*Snapshot`,
copied address lines, copied product name/sku). Those are freeze-at-order
copies, not computed totals. One `business_constraint` on the snapshot
field (if you saw it stay put after the source changed) belongs to the
constraints extractor, not here.

Query-parameter subjects canonicalize to `METHOD /normalizedPath?param`
(not `METHOD /path q`, not `query.param` as a subject). `"true"` / `"false"`
inside `value.accepts` should be booleans; numeric strings should be
numbers (`1`, not `"1"`).

`value` keys come from the published `semanticFactValue` fragment
(`matches`, `accepts`, `forced`, `filter`, `groupBy`, `base`, `factor`,
`rounding`, `unit`, `absent`, …). Use those keys, not prose.

A parameter the UI always sends is not therefore `required`, and it is
not `query_semantics` either. Do **not** emit `accepts: [1]` or
`accepts: [20]` or `accepts: ["30d"]` just because every list request
carried `page` / `pageSize` / `period`. Those are client defaults.
`matches` only if the UI or the response shows **which fields** are
searched, and then list every field you actually saw — a partial
`["firstName"]` is a miss, not a near-hit. If you only saw the typed
string, omit the fact.

Every entry needs a non-empty `evidence` array. Only what was observed —
do not explain how dashboards usually compute revenue.
