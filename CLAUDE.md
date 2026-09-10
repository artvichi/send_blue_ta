# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

An iMessage scheduler: a browser UI queues messages, a backend drains them FIFO
at one per hour (configurable), and a macOS gateway sends them through
Messages.app and reports real delivery status back from `chat.db`.

Read `docs/specs/00-overview.md` before making architectural changes. The ADRs in
`docs/adr/` record decisions that are easy to accidentally undo.

## Commands

```bash
npm run db:up            # Postgres via docker compose
npm run db:migrate       # apply migrations
npm run dev              # server + web
npm run gateway:mock     # gateway, simulated sending
npm run gateway:real     # gateway, real iMessages (needs Full Disk Access)

npm run verify           # typecheck + lint + unit tests -- run before committing
npm run test:int         # integration tests (needs Postgres)
```

Nx targets: `nx run <project>:<target>`. Projects are `web`, `server`, `gateway`,
`shared`.

## Invariants — do not break these without reading the ADR

1. **Postgres is the only source of truth.** The transport carries work; it never
   holds the queue. Adding a broker reintroduces dual-write (ADR 0002).
2. **The claim must keep `FOR UPDATE SKIP LOCKED`.** It is the entire concurrency
   story. Without it, two claimers can get the same row, which means texting a
   real person twice.
3. **Status transitions are rank-guarded and monotonic.** Reports arrive out of
   order. Never apply one without `canTransition`.
4. **`providerGuid` is written once and never overwritten.** It is the
   double-send guard. Sending an iMessage cannot be undone.
5. **`QUEUED` is never reachable by transition.** Retry is a separate operation,
   so no gateway report can resurrect a sent message.
6. **Never log message bodies.** They are personal data. The logger redacts them;
   keep it that way.
7. **The rate gate reads persisted timestamps, never in-memory state.** That is
   what makes a restart safe.

## Conventions

- **Shared types live in `libs/shared`.** Zod schemas are the contract; TS types
  are inferred from them. Never hand-duplicate a type across the boundary.
  `schemas/` is split by domain (message, settings, stats, gateway, common).
- **Types that cross module boundaries get their own file** (`repositories/types.ts`,
  `drivers/types.ts`), and pure helpers get theirs (`services/message-dto.ts`,
  `gateway/apple-time.ts`, `web/hooks/use-now.ts`) rather than accumulating
  inside a service.
- **Never commit compiled output next to sources.** A stale `.js` beside its
  `.ts` silently shadows the real module; `.gitignore` blocks `src/**/*.js`.
- **Validate at the edge.** Phone numbers are normalized to E.164 once, in the
  route handler.
- **Routes throw, middleware shapes.** Handlers throw `HttpError`; they never
  build error payloads.
- **Domain logic stays pure.** Anything touching Postgres belongs in a repository.
- **Comments explain *why*.** The code already says what it does. Existing
  comments document non-obvious reasoning — match that bar or leave it alone.

## Testing

- `apps/server/src/**/*.spec.ts` — unit, no database
- `apps/server/test/**/*.int.spec.ts` — integration, real Postgres, own database
- Integration tests are where concurrency claims are actually proven. If you
  change the claim query, the tests in `test/claim.int.spec.ts` must still pass.

## Gotchas

- Prisma 7 moved the connection URL out of the schema; it lives in
  `prisma.config.ts`, and the runtime uses the `pg` driver adapter.
- **The Prisma client is generated outside `node_modules`** (into
  `apps/server/src/db/generated`), so it relies on npm hoisting its internals to
  the root. This is one of the reasons the project uses npm: pnpm's strict layout
  cannot resolve `@prisma/client-runtime-utils` from there, and the failure shows
  up at server *startup* rather than at build time.
- **`.npmrc` sets `legacy-peer-deps`.** npm 10's resolver crashes on this graph
  without it. It is a workaround for an npm bug, not a way to dodge a real
  version conflict -- those are fixed properly (see `esbuild`, pinned to satisfy
  Vite 8's peer range).
- **`server` and `gateway` build with esbuild, not `tsc`.** tsc does not rewrite
  path aliases on emit, so a tsc build produces JS that still imports
  `@sb/shared` and fails to resolve. Bundling inlines it. Consequence: anything
  `libs/shared` depends on at runtime must also be declared in the app's
  `package.json` (this is why `libphonenumber-js` is listed in both apps).
- Nx targets source the root `.env` themselves via `sh -c 'set -a; . ../../.env'`.
- `RECEIVED` often never arrives (recipient read receipts). Treat `DELIVERED` as a
  success end-state.
- Phone validation uses `isPossible()`, not `isValid()` — see `docs/specs/01-shared.md`.
