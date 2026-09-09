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
pnpm db:up            # Postgres via docker compose
pnpm db:migrate       # apply migrations
pnpm dev              # server + web
pnpm gateway:mock     # gateway, simulated sending
pnpm gateway:real     # gateway, real iMessages (needs Full Disk Access)

pnpm verify           # typecheck + lint + unit tests -- run before committing
pnpm test:int         # integration tests (needs Postgres)
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
- **`.npmrc` hoists `@prisma/*` on purpose.** The client is generated into
  `apps/server/src/db/generated`, outside `node_modules`, so under pnpm's strict
  layout it cannot resolve `@prisma/client-runtime-utils`. Removing the
  `public-hoist-pattern` lines breaks the built server at startup (not at build
  time, which is what makes it easy to miss).
- **`server` and `gateway` build with esbuild, not `tsc`.** tsc does not rewrite
  path aliases on emit, so a tsc build produces JS that still imports
  `@sb/shared` and fails to resolve. Bundling inlines it. Consequence: anything
  `libs/shared` depends on at runtime must also be declared in the app's
  `package.json` (this is why `libphonenumber-js` is listed in both apps).
- Nx targets source the root `.env` themselves via `sh -c 'set -a; . ../../.env'`.
- `RECEIVED` often never arrives (recipient read receipts). Treat `DELIVERED` as a
  success end-state.
- Phone validation uses `isPossible()`, not `isValid()` — see `docs/specs/01-shared.md`.
