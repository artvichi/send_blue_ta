# System overview

An iMessage scheduler in three parts, plus a dashboard.

| Domain | Lives in | Spec |
|---|---|---|
| Scheduling UI | `apps/web` | [04-web.md](./04-web.md) |
| Delivery backend | `apps/server` | [02-server.md](./02-server.md) |
| iMessage gateway | `apps/gateway` | [03-gateway.md](./03-gateway.md) |
| Shared contract | `libs/shared` | [01-shared.md](./01-shared.md) |
| Deployment | `infra`, `.github` | [05-deployment.md](./05-deployment.md) |

## The shape of it

```
Browser ──REST + polling──▶ Server ──Postgres──▶ queue of record
                              ▲
                              │ long-poll lease  (gateway always dials out)
                              │ status reports
                              │
                          Gateway ──osascript──▶ Messages.app
                              ▲                      │
                              └──── chat.db ◀────────┘
```

## Two decisions that explain everything else

**1. The mockup has no date picker, so the timestamp is derived.**

The compose form collects a phone number and a message, nothing else. Yet each
queued row displays a send time. That time is a projection from queue position
and the current drain interval:

```
anchor = max(lastDispatchedAt + interval, now)
eta(i) = anchor + i * interval
```

It is computed server-side on every read, never stored. Storing it would mean
rewriting every row behind a cancelled message, and every row in the queue
whenever the interval changes.

**2. The real terminal state arrives long after any transport acknowledgement.**

AppleScript reports nothing about what it sent. `DELIVERED` and `RECEIVED` come
only from polling `chat.db`, seconds to minutes later.

That single fact removes most of the value a message broker would add here: the
acknowledgement a broker gives you is not the outcome anyone cares about. So
durability lives in Postgres, the transport is deliberately dumb, and recovery
is a lease and a reaper rather than broker redelivery.

## What "performance" means at one message per hour

Not throughput. Correctness under failure:

- A restart must neither burn an interval slot nor double-spend one.
- A crash mid-dispatch must not lose the message.
- A lost status report must not cause the same iMessage to be sent twice.
- An out-of-order status report must not walk a message backwards.

Each has a named mechanism, described in [02-server.md](./02-server.md).

## Deliberate non-goals

- **No authentication for the dashboard.** The assessment describes a local tool.
  The gateway protocol *is* authenticated, because an open lease endpoint would
  let anyone drain the queue.
- **No message broker.** See [ADR 0002](../adr/0002-no-message-broker.md).
- **No multi-tenancy.** One queue, one gateway pool, one signed-in Apple account.
