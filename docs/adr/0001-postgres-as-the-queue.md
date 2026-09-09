# ADR 0001: Postgres is the queue of record

**Status:** accepted

## Context

The system needs a durable FIFO queue drained at one message per hour, with
recovery when the consumer dies mid-work.

## Decision

Use Postgres as the queue itself — `FOR UPDATE SKIP LOCKED` for claiming, a lease
column plus a reaper for recovery — rather than a dedicated queue technology.

## Rationale

- **One source of truth.** Every question about a message is answered by one
  query against one database.
- **`SKIP LOCKED` is genuinely sufficient.** It is the same primitive that backs
  most Postgres-based job queues, and it makes concurrent claims safe without any
  coordination service.
- **The lease/reaper pattern covers what broker acks would.** And it covers it
  better here, because the real completion signal (`DELIVERED` from `chat.db`)
  arrives long after any transport ack could.
- **At one message per hour, throughput is irrelevant.** The interesting
  properties are all correctness properties.

## Consequences

- Exactly one raw SQL query, because Prisma cannot express `SKIP LOCKED`. It is
  isolated in one repository function and its result is Zod-validated.
- No Redis, no RabbitMQ, one container to run locally.
- Scaling past a few thousand messages/hour would warrant revisiting this.
