Extract `workflows`. Read the **timeline** in the digest (step, UI action,
resulting requests) and `blockedActions`. Return a JSON array.
No wrapper, no markdown, no commentary.

One user goal per workflow. The matching key is the ordered sequence of
`(operation, role)` after dropping `refresh` steps. One extra or missing
non-refresh step makes the whole workflow a miss — do not append the GETs
the page fires after success, and do not combine two user goals.

Never put `GET /api/auth/session` in a workflow. It is a session probe the
shell fires on navigation, not a step of a user goal. Do not prefix list /
detail / create sequences with it.

`role` is one of `required_business`, `auxiliary_lookup`, `refresh`,
`auth`. `auth` and `required_business` are the same slot for login/logout;
prefer `required_business`. Use `refresh` only for post-success reloads
you are about to drop from the key — better to omit them.

Edit and status-change goals are two steps: `GET /{}/` with
`auxiliary_lookup`, then `PATCH` with `required_business`. A lone PATCH
is not a workflow — omit it rather than emit a one-step miss.

A blocked Delete / Delete draft click (see `blockedActions`) is a
one-step workflow `DELETE /api/orders/{}` or `DELETE /api/customers/{}`
with `required_business`, if that DELETE operation is already in the
digest or was emitted from the same blocked click. Do not invent a
pre-GET. Ignore a button labelled `Delete Me`.

`steps[].operation` is `METHOD /normalized/path`. Placeholder names in the
path are not scored; concrete ids are never fine.

Every workflow needs `user_goal`, `steps` (min 1), and a non-empty
`evidence` array. Only sequences you saw in the timeline or as a blocked
destructive click.
