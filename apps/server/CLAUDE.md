# apps/server

Express + Prisma over Postgres. Owns the queue and all durable state.

## Structure

`config/` env + logger · `db/` Prisma client · `domain/` pure policies ·
`repositories/` data access · `scheduler/` rate limiter + reaper ·
`services/` read models · `http/` routes and middleware

## Rules specific to this app

- **`claimNextMessage()` is the only raw SQL.** Keep it that way, keep
  `FOR UPDATE SKIP LOCKED`, and keep the Zod parse on its result.
- **Claims are pull-driven.** No timer claims work. A message leaves the queue
  only when a gateway asks, which is why an offline gateway cannot burn slots.
- **Position and ETA are derived on read, never stored.** Storing them would mean
  rewriting rows whenever the queue or interval changes.
- **`/api/gateway/*` is the authenticated machine protocol.** The dashboard's view
  of gateway health is `/api/system/gateway`. Do not merge these namespaces — the
  browser must never need the gateway token.
- **Handlers throw `HttpError`.** `errorHandler` is the only place an error
  becomes a response body.
- Use `pathParam(req, 'id')` rather than `req.params.id`; Express 5 types params
  as possibly an array.

## Prisma 7

The datasource has no `url`. Migrations read it from `prisma.config.ts`; the
runtime connects through `PrismaPg` in `src/db/prisma.ts`. Regenerate with
`nx run server:db:generate` after schema edits.

`declaration` is off in `tsconfig.json` — this is an application and emitting
types only produces unresolvable cross-package naming errors under pnpm.
