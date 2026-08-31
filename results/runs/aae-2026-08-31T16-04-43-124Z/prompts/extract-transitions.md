Extract `semantic_facts` of kind `state_transition` and `concurrency`.
Return a JSON array. No wrapper, no markdown, no commentary.

One atomic fact per entry. A transition from one state with several
destinations uses `value.from` and `value.to` as an array — that is one
fact because the published value shape holds the set. Two source states
are two facts.

`value` keys come from the published `semanticFactValue` fragment (`from`,
`to`). Do not write prose in `value`. For `to`, list only destinations
you actually switched to in this run. An incomplete `to: [40]` or
`to: [50]` when you did not exercise the rest of that source state's
graph is worse than omitting the fact — do not guess the rest of the
graph, and do not publish a singleton `to` you did not fully map.

`concurrency.value` is the error `code` token from the 409 body
(`"VERSION_CONFLICT"`), not `{field, effect: "increase"}`. Subject is
the version field (`version`), not the PATCH path.

`kind` is only `state_transition` or `concurrency`.

Every entry needs a non-empty `evidence` array citing the requests that
showed the transition or the 409. Only what was observed — a lifecycle
you did not exercise is not a fact.
