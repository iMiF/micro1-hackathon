# artifacts

Deterministic renderer: `reconstruction.json` → OpenAPI 3.1 + a human-readable draft.

> Boundary (docs/02 §7): the generator turns verified JSON into OpenAPI/docs. It does not add
> facts, does not call an LLM, and does not invent a `summary` or a parameter name. A missing
> field stays missing. The header of every file states that the output requires human review
> (docs/07 §3).

```bash
npm run artifacts:generate -- <run-id>
```

Writes `openapi.json` and `API.md`. Both agents call this after they write `reconstruction.json`.
VARS is unaffected — this is the product surface, not a scoring input.

```bash
npm run artifacts:preview
npm run artifacts:preview -- --run aae-2026-08-31T14-51-18-382Z --open
```

Local Swagger UI on `http://127.0.0.1:8090`. The top dropdown lists every run under
`results/runs/` that has a reconstruction (and the committed perfect-reconstruction example,
labeled as a reference). Switching artifacts reloads that run's OpenAPI; the `API.md` tab shows
the markdown draft. `Try it out` is proxied to the local MiniCRM API (`--target`, default
`http://127.0.0.1:3000`) and is not a claim about the target — the `servers` block is added only
in the preview response, never written back to `openapi.json`.

The Swagger UI chrome is loaded from a pinned jsDelivr copy of `swagger-ui-dist`. Specs never
leave the machine.

Offline check: `npm run artifacts:selftest`.
