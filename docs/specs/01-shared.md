# Shared contract (`libs/shared`)

The single definition of everything that crosses a process boundary. Consumed by
all three apps, so a change to a rule cannot land in one and not the others.

## Modules

| File | Responsibility |
|---|---|
| `status.ts` | The message lifecycle and its transition rules |
| `schemas.ts` | Zod schemas for every request and response |
| `eta.ts` | Projected send times |
| `phone.ts` | E.164 normalization |

## The status state machine

```
QUEUED(0) → DISPATCHING(1) → ACCEPTED(2) → SENT(3) → DELIVERED(4) → RECEIVED(5)
```

`FAILED` and `CANCELED` sit outside the ranking; they are terminal and reached by
rule rather than by rank.

Rules, in precedence order:

1. Nothing leaves a terminal status.
2. `CANCELED` is reachable only from `QUEUED` — once the gateway holds a message
   the send may already have happened, and an iMessage cannot be recalled.
3. `FAILED` is reachable from any non-terminal status.
4. `QUEUED` is never reachable by transition. Retry is a separate operation, so
   no gateway report can ever resurrect a message.
5. Otherwise the move must strictly advance the rank.

Rule 5 is what makes out-of-order reports safe: a `SENT` that arrives after the
`DELIVERED` behind it is discarded rather than applied.

Rule 4 matters more than it looks. If a status report could set `QUEUED`, a
buggy or hostile gateway could put a sent message back in the queue and cause a
duplicate text.

## Vocabulary

The five statuses the assessment names are kept verbatim, including `RECEIVED`
rather than the more conventional `READ`. `DISPATCHING`, `FAILED` and `CANCELED`
are additions; `DISPATCHING` is what makes lease-based recovery expressible.

## Phone validation: `isPossible`, not `isValid`

`libphonenumber-js` offers both. This project accepts `isPossible()`.

`isValid()` checks against a numbering-plan database and rejects every 555 area
code as fictional — including `+1 (555) 123-4567`, the number printed in the
assessment's own mockup. Anyone testing the app with the obvious number would hit
a validation error.

Wrongly rejecting a deliverable number is worse than accepting an undeliverable
one, because failure is already a first-class outcome: the gateway reports
`FAILED` and the dashboard surfaces it. The `valid` flag is carried through so a
caller could warn without blocking.

`isPossible()` still rejects unparseable input and anything of the wrong length.

## ETA projection

Pure functions over `{ lastDispatchedAt, intervalSeconds, now }`. `now` is
injected rather than read, which is what makes the whole module testable without
faking clocks.

`projectAnchor` collapses to `now` once an interval has already elapsed, so a
queue idle for six hours does not believe it owes six messages.
