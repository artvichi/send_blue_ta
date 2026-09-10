# iMessage Scheduler

A browser UI queues iMessages, a backend drains them **FIFO at one per hour**
(configurable), and a **macOS gateway** sends them through Messages.app and
reports real delivery status back by reading `chat.db`.

> **Implementation plan and architecture write-up:**
> https://claude.ai/code/artifact/8691df39-37b1-4808-9071-34ed4919d79b

```
Browser ──REST + polling──▶ Server ──▶ Postgres  (the queue of record)
                              ▲
                              │ long-poll lease   ← the gateway always dials out
                              │ status reports
                          Gateway ──osascript──▶ Messages.app
                              ▲                       │
                              └───── chat.db ◀────────┘
```

---

## Quick start

Prerequisites: **Node 22+**, **npm 10+**, **Docker Desktop running**.

```bash
git clone git@github.com:artvichi/send_blue_ta.git
cd send_blue_ta

npm install
cp .env.example .env      # the defaults work as-is

npm run db:setup          # Postgres in Docker + schema + test database
npm run dev               # api :4310, web :4320
```

Then in a second terminal:

```bash
npm run gateway:mock      # simulated sending, no macOS permissions needed
```

Open **http://localhost:4320** — that is the UI. (`:4310` is the API; it serves
JSON only.) Nothing drains without a gateway running, so start it too.

To watch the queue work, go to **Dashboard → Send rate → 10s**, then schedule a
few messages on the Schedule page.

### What each piece is

| Process | Port | Notes |
|---|---|---|
| Web UI | **4320** | Vite dev server |
| API | **4310** | Express; `/` describes itself |
| Postgres | **5433** | Docker container `sbta-postgres` |
| Gateway | — | dials out to the API; no port of its own |

Ports are deliberately off the common 3000/4200/5432 defaults so the stack does
not collide with whatever else you run locally. **5433** in particular avoids a
Postgres you may already have on 5432 — this project never touches it.

### Everything you can run

```bash
npm run dev            # api + web
npm run dev:all        # api + web + gateway
npm run gateway:mock   # gateway, simulated sending
npm run gateway:real   # gateway, real iMessages (macOS only)
npm run gateway:setup  # guided macOS permission setup

npm run verify         # typecheck + lint + unit tests
npm test               # unit tests
npm run test:int       # integration tests (needs npm run db:setup first)
npm run build          # build everything

npm run db:up          # start Postgres
npm run db:down        # stop it
npm run db:setup       # start + migrate + create/migrate the test database
npm run db:migrate     # apply migrations after a schema change
npm run db:studio      # browse the data
npm run db:seed        # a few sample messages
```

### Troubleshooting

| Symptom | Cause |
|---|---|
| `localhost:4310` shows JSON, not the app | That is the API. The UI is **4320**. |
| Queue never drains | No gateway running — start `npm run gateway:mock`. |
| `npm run test:int` fails to connect | Run `npm run db:setup` first. |
| `db:up` hangs or errors | Docker Desktop is not running. |
| Port already in use | Something else holds 4310/4320/5433; change it in `.env`. |

### Sending real iMessages

```bash
npm run gateway:setup    # guided macOS permission setup
npm run gateway:real
```

Requires macOS with Messages signed in, plus two permissions:

| Permission | Why |
|---|---|
| **Full Disk Access** | read `chat.db` for delivery status |
| **Automation** | drive Messages.app via `osascript` |

macOS will not let any program grant these to itself — that is what TCC is for.
What `gateway:setup` removes is the guesswork around the click:

- **It names the app that actually needs the permission.** The grant belongs to
  the application hosting your terminal (iTerm, Terminal, VS Code…), *not* to
  `node`. Adding `node` is the usual reason this silently never works.
- **It opens the exact settings pane**, and reveals that app in Finder so it can
  be dragged straight into the list.
- **It watches for the grant to land** and tells you the moment it does, instead
  of leaving you to guess whether a restart was needed.

`gateway:real` runs the same check on startup, so it self-heals rather than
failing on the first real send. Everything works without either permission using
`npm run gateway:mock`.

### Everything in containers

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up --build
# web :4330, api :4310
```

Migrations run as their own one-shot job before the API starts, so a fresh
volume needs no manual step. The gateway is still run natively — it needs macOS
APIs and cannot be containerized.

---

## Repository layout

```
apps/
  web/        React 19 · Vite · Tailwind v4 · shadcn · React Query
  server/     Express 5 · Prisma 7 · Postgres
  gateway/    Node · osascript · chat.db      (runs natively on macOS)
libs/
  shared/     Zod schemas · status state machine · ETA projection
infra/        Terraform: VPC, RDS, ECS Fargate, ALB, S3 + CloudFront
docs/
  specs/      one spec per domain
  adr/        the decisions worth arguing about
```

Nx monorepo on npm workspaces. Projects: `web`, `server`, `gateway`, `shared`.

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | server + web |
| `npm run dev:all` | server + web + gateway |
| `npm run gateway:mock` / `npm run gateway:real` | gateway, simulated / real |
| `npm run verify` | typecheck + lint + unit tests |
| `npm test` | unit tests |
| `npm run test:int` | integration tests (needs Postgres) |
| `npm run build` | build everything |
| `npm run db:up` / `db:migrate` / `db:seed` / `db:studio` | database |

---

## How it works

### The queue

Postgres is the only source of truth. Claiming is one raw query — the sole place
the codebase leaves Prisma's query API, because Prisma cannot express the clause
that matters:

```sql
SELECT id FROM "messages"
WHERE status = 'QUEUED'
ORDER BY "forceDispatch" DESC, "queueSeq" ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

`SKIP LOCKED` makes a concurrent claimer step over a locked row rather than block
on it, so any number of server instances each claim a **different** message —
with no leader election, advisory lock, or coordination service.

### Claims are pull, not push

Nothing claims work on a timer. A message leaves the queue only when a gateway
asks for a lease. So **an offline gateway cannot burn interval slots**: if nobody
asks, nothing is claimed, and the slot is still there when it returns.

### Recovery is a lease and a reaper

A claim leases the message for `LEASE_SECONDS`. A sweep returns expired leases to
`QUEUED`. That — not the transport — is where delivery reliability lives, and it
covers gateway crash, network partition, and death mid-dispatch.

### Never sending the same text twice

Sending an iMessage is irreversible. `providerGuid` is written once, never
overwritten, and **survives a reap**, so it travels with the next lease. If a send
succeeded but its status report was lost, the gateway recognises the message and
re-attaches instead of sending it again.

At-least-once delivery with an idempotent consumer. Exactly-once is not claimed,
because exactly-once does not exist.

### Status reports are guarded three ways

They arrive duplicated, out of order, and sometimes from an attempt that no
longer exists:

1. **Dispatch token** must match the current attempt.
2. **Rank check** — a late `SENT` cannot overwrite `DELIVERED`.
3. **Unique `(messageId, status)`** — a replay collides instead of duplicating.

### The send time is derived, not chosen

The mockup has no date picker, and that is the design. The queue is FIFO at a
fixed rate, so a message's send time follows from its position:

```
anchor = max(lastDispatchedAt + interval, now)
eta(i) = anchor + i * interval
```

Computed server-side on every read, never stored — so cancelling a message or
changing the interval re-times the whole queue for free.

### One transport concept

The gateway long-polls; the browser polls. There is **no WebSocket and no SSE
anywhere** — plain HTTP end to end, one datastore. Fewer moving parts, fewer
failure modes.

---

## Things worth knowing

**`RECEIVED` frequently never arrives.** It requires the recipient to have read
receipts enabled, which most people do not. `DELIVERED` is treated as a
legitimate success end-state throughout. This is a property of iMessage, not a
gap in the implementation.

**Phone validation accepts `isPossible()`, not `isValid()`.** `isValid()` rejects
every 555 area code as fictional — including `+1 (555) 123-4567`, the number in
the assessment's own mockup. Wrongly rejecting a deliverable number is worse than
accepting an undeliverable one, since `FAILED` is already a visible, retryable
outcome.

**Apple timestamps are nanoseconds since 2001-01-01**, not Unix:
`unix = appleNs / 1e9 + 978307200`.

**`chat.db` is read through a snapshot.** Messages.app holds it open in WAL mode,
so `.db`, `-wal` and `-shm` are copied together and the copy is opened read-only.

**Message bodies are never logged.** They are personal data; the logger redacts
them explicitly.

---

## Testing

```bash
npm test        # unit -- pure logic, no database, milliseconds
npm run test:int    # integration -- real Postgres, own database
```

Unit tests cover the status state machine, ETA projection, the rate gate, phone
normalization and the Apple epoch conversion.

Integration tests run against a real Postgres, in two layers. The repository
suites prove what only a database can: that five concurrent claims return five
*different* messages, that the reaper reclaims abandoned leases, that a stale
dispatch token is rejected, and that the GUID survives a reap. The HTTP suite
proves a caller actually experiences all of that — E.164 normalization through
the route, the validation error shape, gateway auth, the rate gate closing after
one lease, and the conflict codes on cancel and retry.

CI runs both on every pull request, against a Postgres service container.

---

## Deployment

`GitHub → Docker → ECR → Terraform → AWS`, with **GitHub OIDC** into an IAM role
(no long-lived AWS keys). The Terraform is real and validated; it is never
applied, because this is an assessment.

**The gateway cannot run in AWS** — it needs a signed-in macOS Messages account,
so it lives on a Mac (on-prem, MacStadium, or an EC2 `mac2.metal` instance).

This is where the transport decision pays off. Because the gateway **dials out**,
it works from anywhere with outbound HTTPS: no inbound rules, no VPN, no public
IP, no port forwarding. There is not one inbound gateway rule anywhere in
`infra/`. The design chosen for local simplicity is exactly what makes the
production topology work.

Details in [`docs/specs/05-deployment.md`](docs/specs/05-deployment.md).

---

## Extending it

Designed for, not speculatively built:

- **Scheduling policy** — `SchedulingPolicy` contributes SQL fragments to one
  shared claim query, so every policy inherits the `SKIP LOCKED` guarantee.
  `FIFO` ships; `TIMESTAMPED` is implemented against the already-present
  `scheduledAt` column. Switching is a `Setting.policy` value, not a refactor.
- **Rate limiting** — a separate interface from ordering, so per-recipient
  fairness or quiet hours is a new `RateLimiter`, not surgery on the scheduler.
- **Driver** — `applescript` and `mock` ship; a hosted provider is a third
  implementation of the same interface.
- **Transport** — long-poll ships. A broker would slot in behind the same seam,
  but would need a transactional outbox to avoid dual-writing against Postgres,
  which is exactly why it was not adopted. See
  [ADR 0002](docs/adr/0002-no-message-broker.md).

---

## Documentation

| Doc | |
|---|---|
| [Overview](docs/specs/00-overview.md) | the system and the two decisions that shape it |
| [Shared contract](docs/specs/01-shared.md) | status machine, schemas, ETA, phone rules |
| [Server](docs/specs/02-server.md) | queue, claim, reaper, API |
| [Gateway](docs/specs/03-gateway.md) | AppleScript, `chat.db`, drivers, permissions |
| [Web](docs/specs/04-web.md) | structure, state, design decisions |
| [Deployment](docs/specs/05-deployment.md) | Docker, CI, Terraform, AWS |
| [ADR 0001](docs/adr/0001-postgres-as-the-queue.md) | Postgres as the queue |
| [ADR 0002](docs/adr/0002-no-message-broker.md) | why no message broker |
| [ADR 0003](docs/adr/0003-pull-based-gateway.md) | why the gateway dials out |

`CLAUDE.md` at the root and in each app carries the invariants worth not breaking.
