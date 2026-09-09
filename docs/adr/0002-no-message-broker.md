# ADR 0002: No message broker

**Status:** accepted

## Context

RabbitMQ was considered for carrying work from the server to the gateway.

## Decision

Use HTTP long-poll with a claim, behind an interface that a broker could later
implement.

## Rationale

**A broker would create a second source of truth.** Postgres holds the queue; a
broker would hold a copy of pending work. That is the dual-write problem: commit
then publish and a failed publish strands the message; publish then commit and a
failed commit sends something never recorded. Solving it properly requires a
**transactional outbox with a relay process** — real work, existing only to
reconcile two systems we did not need to have.

**Broker reliability does not fit this domain.** You would ack on receipt, but
"sent successfully" is only known ~30s later from `chat.db`. The redelivery
guarantees protect a step that was not the risky one.

**Ordering is already solved.** Strict FIFO holds with a single consumer, but
order is enforced in Postgres by `queueSeq` regardless. Redundant.

**Operational cost is real.** Another container, credentials, connection
recovery, and one more thing that can fail on a reviewer's machine.

## When this would be wrong

Many gateways across many machines, thousands of messages per hour, or several
independent consumers fanning out off the same event. None is true at one message
per hour with one Mac.

## Consequences

- `GatewayTransport` is an interface; an AMQP implementation would slot in.
- Combined with React Query polling, there is no WebSocket or SSE in the system.
- Recovery is a lease and a reaper rather than ack/nack.
