Extract `semantic_facts` of kind `enum_mapping` and `identifier_meaning`.
Return a JSON array. No wrapper, no markdown, no commentary.

One atomic fact per entry. If a subject has n distinguishable values, that
is n entries — packing several values into one object is one false
positive, not several true positives.

`value` is either a token you literally saw (the numeric status, the
header name, the cookie name) or an object whose keys come from the
published `semanticFactValue` fragment supplied with this prompt. Use those
keys, not prose. `meaning` is free text and is not scored.

`kind` is only `enum_mapping` or `identifier_meaning`.

Subjects: the JSON body field as it appears on the wire (`order.statusId`,
`shipping.methodId`, `activity.eventType`, `order.paymentStatus`), not the
UI widget name (`shippingOption.methodId`). Also `header:Name`,
`cookie:name`, `Set-Cookie:name`. Field-reference prefixes are
case-sensitive except HTTP header names.

Every entry needs a non-empty `evidence` array. A meaning needs both a UI
side (`ui_label` / `ui_control` / `ui_action`) and a network side. A single
request is not enough to know what a number means.

Only what was observed. Do not guess labels a CRM usually uses.
