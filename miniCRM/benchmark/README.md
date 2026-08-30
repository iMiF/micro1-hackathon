# MiniCRM benchmark audit

Author-only artifacts for the Agentic Workflows hackathon. This directory documents **ground truth derived from the MiniCRM source**. It is not served by the running application and must not be given to an evaluated agent.

The agent under evaluation may only use:

- the running UI at `http://localhost:5173`
- same-origin `/api` traffic (Vite proxies to Fastify on port 3000)
- browser cookies, headers, and response bodies observed from that traffic

The agent must not receive this folder, application source, tests, or seeds.

## Layout

| Path | Role |
| --- | --- |
| `INVENTORY.md` | Human-readable source-backed inventory |
| `GAPS.md` | Benchmark-quality gaps (not implemented in the app) |
| `cases.draft.json` | Draft cases from the audit step |
| `cases.json` | **Final** evaluation cases with ground-truth IDs |
| `ground-truth/manifest.json` | Benchmark identity and git commit |
| `ground-truth/api.json` | Normalized UI-observable operations |
| `ground-truth/semantics.json` | Business meanings that HTTP syntax alone does not give |
| `ground-truth/dependencies.json` | Cross-request field dependencies |
| `ground-truth/workflows.json` | User-visible workflows with step roles |
| `ground-truth/actions.json` | UI actions and risk class |
| `schemas/reconstruction-output.schema.json` | Canonical agent/baseline output schema |
| `examples/perfect-reconstruction.json` | 100% reconstruction for evaluator tests |
| `scripts/emit-ground-truth.mjs` | Regenerates machine-readable files from the author script |
| `scripts/validate-ground-truth.mjs` | JSON parse, schema, and ID-reference checks |

## Scope

`api.json` includes the **26 operations the Vue UI actually calls**. These server routes exist but are **out of scope** for the browser benchmark:

- `PATCH /api/orders/{id}` (payment status; no UI control)
- `PATCH /api/customers/{customerId}/addresses/{addressId}` (frontend dead path)

Do not add API docs, enum lookup endpoints, or debug UI to the running application.

## Agent output

Both the baseline and the evaluated agent must emit JSON matching `schemas/reconstruction-output.schema.json`. Evidence may only cite UI text/controls and HTTP observations (`network_request`, `network_response`, `ui_label`, `ui_control`, `ui_action`, `cookie`, `header`).

## Reset

`npm run db:reset` is an out-of-band developer command. There is no browser-accessible reset endpoint.
