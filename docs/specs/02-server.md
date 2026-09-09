# Delivery backend (`apps/server`)

Node + Express + Prisma over Postgres. Owns the queue, the drain rate, and every
piece of durable state in the system.

## Layout

```
src/
  config/        env parsing (fails fast), logger
  db/            Prisma client + generated types
  domain/        scheduling policies (pure, no I/O)
  repositories/  data access, including the one raw claim query
  scheduler/     rate limiter, lease reaper
  services/      read models -- positions, ETAs, stats
  http/          routes, middleware, error shaping
```

Domain logic is pure and unit-testable without a database. Everything that
touches Postgres is a repository. Routes throw; they never shape error payloads
themselves, so the response format cannot drift between endpoints.

## The claim: the one raw query

```sql
UPDATE "messages" SET
  status = 'DISPATCHING', "dispatchToken" = $1,
  "leaseExpiresAt" = $2, "dispatchedAt" = $3,
  "forceDispatch" = FALSE, attempts = attempts + 1
WHERE id = (
  SELECT id FROM "messages"
  WHERE status = 'QUEUED' AND <policy eligibility>
  ORDER BY <policy ordering>
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING ...;
```

Prisma cannot express `FOR UPDATE SKIP LOCKED`, so `claimNextMessage()` uses
`$queryRaw`. It is the only raw query in the codebase, and its result is parsed
by Zod rather than cast — a schema change that breaks it fails there, loudly,
rather than somewhere downstream.

Why the clause matters: `SELECT ... FOR UPDATE` locks the candidate row, and
`SKIP LOCKED` makes a concurrent claim step over a locked row instead of blocking
on it. N server instances each claim a *different* message. No leader election,
no advisory lock, no coordination service.

## Claims are pull, not push

There is no ticker that claims work on a timer. A message leaves the queue only
when a gateway asks for a lease.

The consequence is worth stating plainly: **an offline gateway cannot consume
interval slots.** If nobody asks, nothing is claimed, and the slot is still there
when the gateway comes back.

## Failure recovery: lease and reaper

A claim sets `leaseExpiresAt = now + LEASE_SECONDS`. A sweep every
`REAP_INTERVAL_MS` returns expired leases to `QUEUED`.

This — not the transport — is where delivery reliability lives. It covers gateway
crash, network partition, and process death mid-dispatch, and it is the same
guarantee a broker's ack/nack redelivery would provide, implemented in the
database that already owns the truth.

## Rate limiting is separate from ordering

Two interfaces, deliberately not one:

- `SchedulingPolicy.eligibility()` / `.ordering()` — *which* message is next
- `RateLimiter.canSendNow()` — *whether* now is an allowed moment

`FixedIntervalLimiter` gates on `max(dispatchedAt) + interval <= now`, read from
the settings row. Because the gate derives from **persisted timestamps rather
than in-memory state**, a restart can neither burn a slot nor double-spend one.

## The three guards on a status report

Reports arrive duplicated, out of order, and occasionally from an attempt that no
longer exists.

1. **Dispatch token** must match the current attempt. A report from an attempt
   the reaper already reclaimed is discarded rather than applied to the newer one.
2. **Rank check** (`canTransition`) — a late `SENT` cannot overwrite `DELIVERED`.
3. **Unique `(messageId, status)`** on the event log — a redelivered report
   collides and is dropped rather than duplicating a timeline entry.

All three answer `202`. The gateway did nothing wrong and retrying would not help.

## The double-send guard

Sending an iMessage is irreversible. `providerGuid` is written once, never
overwritten, and survives a reap. It travels with the next lease so the gateway
can recognise a message that was already sent — the case where the send
succeeded but its status report was lost.

The system targets **at-least-once delivery with an idempotent consumer**. It
does not claim exactly-once, because exactly-once does not exist.

## API

Public (rate limited, no auth):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/messages` | Schedule; normalizes to E.164 |
| `GET` | `/api/messages` | Newest first, filterable, cursor paginated |
| `GET` | `/api/messages/queue` | The queue in send order, with positions and ETAs |
| `GET` | `/api/messages/:id` | Detail plus full event timeline |
| `DELETE` | `/api/messages/:id` | Cancel (only while `QUEUED`) |
| `POST` | `/api/messages/:id/retry` | Requeue a failed message |
| `POST` | `/api/messages/:id/send-now` | Jump the queue, bypass the gate once |
| `GET`/`PATCH` | `/api/settings` | Read/update interval and pause |
| `GET` | `/api/stats` | Dashboard tiles |
| `GET` | `/api/system/gateway` | Gateway liveness (read-only view) |

Gateway protocol (`Authorization: Bearer $GATEWAY_TOKEN`, not rate limited):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/gateway/lease?wait=25` | Long-poll; `200` with a claim or `204` |
| `POST` | `/api/gateway/messages/:id/status` | Report an observed change |
| `POST` | `/api/gateway/heartbeat` | Liveness |

The two namespaces are kept apart on purpose. `/api/gateway/*` is the
authenticated machine protocol; the dashboard's read-only view of gateway health
lives at `/api/system/gateway` so the browser never needs the gateway token.

Health checks (`/healthz`, `/readyz`) sit outside `/api` and outside the rate
limiter, so a probe can never be throttled.

## Security

Helmet, a CORS allowlist, rate limiting on public routes, Zod validation at every
boundary, and constant-time token comparison. **Message bodies are never
logged** — they are personal data, and the logger redacts them explicitly.
