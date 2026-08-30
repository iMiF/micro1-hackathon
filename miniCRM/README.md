# MiniCRM

A synthetic e-commerce CRM designed as a **controlled target application** for evaluating autonomous API reverse-engineering agents.

Shop employees use it to manage customers, products, and orders. An agent is expected to explore the running UI, observe network traffic, and reconstruct API behavior from that evidence.

## What this is not

- Not production software
- Not a payment, tax, or shipping product
- Tax amounts are **synthetic benchmark logic**, not real tax guidance
- Data is synthetic
- No external services, email, analytics, or payment providers are contacted

## Quick start

Requires Node.js 22 and Docker.

```bash
npm install
docker compose up -d
npm run db:reset
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000 (the Vite dev server proxies `/api` to Fastify)

Demo login:

- Email: `admin@minicrm.local`
- Password: `demo123`

## How to reset

```bash
npm run db:reset
```

This drops application data, re-runs migrations, and restores the same deterministic seed. It is an out-of-band developer command. There is no browser-accessible reset endpoint.

## Tests

```bash
npm run typecheck
npm run test:api
npx playwright install chromium
npm run test:e2e
```

API tests reset the database themselves. Playwright smoke tests expect PostgreSQL to be running.

## Architecture

- **Frontend:** Vue 3 + TypeScript + Vite + Vue Router at `apps/web`
- **Backend:** Node.js 22 + Fastify 5 + TypeScript at `apps/api`
- **Database:** PostgreSQL 17 via Docker Compose

The browser talks to `http://localhost:5173`. Same-origin `/api` requests are proxied to Fastify.

## Benchmark

Evaluation fixtures live under `benchmark/`. See `benchmark/README.md`.

**Ground truth must not be provided to an agent during evaluation.** The running application does not serve these files or other API documentation.

Developer-only pointers (do not include in agent context):

- `benchmark/ground-truth/manifest.json`
- `benchmark/ground-truth/api.json`
- `benchmark/ground-truth/semantics.json`
- `benchmark/ground-truth/dependencies.json`
- `benchmark/ground-truth/workflows.json`
- `benchmark/ground-truth/actions.json`
- `benchmark/cases.json`
- `benchmark/schemas/reconstruction-output.schema.json`
- `benchmark/examples/perfect-reconstruction.json`
