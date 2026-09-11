# iMessage Scheduler

Queue iMessages in a browser. A backend sends them **one per hour** (configurable)
through a **macOS gateway** that drives Messages.app and reads real delivery
status — sent, delivered, read — from `chat.db`.

<p align="center">
  <img src="docs/images/schedule.png" alt="The Schedule screen: recipient, message, and the queue below" width="720">
</p>

- [Quick start](#quick-start)
- [Using the app](#using-the-app)
- [Sending real iMessages](#sending-real-imessages)
- [Commands](#commands)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [Further reading](#further-reading)

## Quick start

You need:

- **Node 22+** (`nvm use` picks it up from `.nvmrc`)
- **Docker Desktop**, running — it hosts Postgres
- for real sends only: a **Mac with Messages.app signed in** to an Apple ID

```bash
git clone git@github.com:artvichi/send_blue_ta.git && cd send_blue_ta
npm install
cp .env.example .env      # the defaults work as-is
npm run db:setup          # starts Postgres in Docker and applies migrations
npm run dev               # API on :4310, web on :4320
```

In a second terminal, start a gateway — the process that actually sends:

```bash
npm run gateway:setup     # once: grants the two macOS permissions, guided
npm run gateway:real      # real iMessages from your account
```

Not on a Mac, or only touching the UI? `npm run gateway:mock` plays the same
lifecycle on timers and needs no permissions. CI uses it.

Open **http://localhost:4320**. To see it work end to end: *Settings → Send
rate → 10s*, schedule a message to yourself, and watch the Dashboard.

```
Browser ──REST + polling──▶ Server ──▶ Postgres  (the queue of record)
                              ▲
                              │ long-poll lease   ← the gateway dials out
                              │ status reports
                          Gateway ──osascript──▶ Messages.app
                              ▲                       │
                              └───── chat.db ◀────────┘
```

| Process | Port | |
|---|---|---|
| Web | 4320 | Vite dev server — this is the UI |
| API | 4310 | Express — JSON only; `/` lists its routes |
| Postgres | 5433 | Docker — deliberately off 5432 so it never touches a local install |
| Gateway | — | dials out to the API; nothing listens on it |

## Using the app

| Tab | What it is for |
|---|---|
| **Dashboard** (home) | Stat tiles, activity chart over 24h / 7d / 30d, every message with its status and attempt count. Click a row for its timeline. Retry failed sends from here. |
| **Schedule** | Compose. The recipient field searches your address book as you type; the queue below shows the order and projected time of everything waiting. Cancel or *send now* per message. |
| **Recipients** | Names for the numbers and emails you message. Matched to messages by the normalized handle, so adding a name labels existing history too. |
| **Settings** | Send rate, pause/resume, and the retry budget. Stored in the database, so they survive restarts. |

Statuses, in order: `QUEUED → DISPATCHING → ACCEPTED → SENT → DELIVERED → RECEIVED`,
plus `FAILED` and `CANCELED`. `RECEIVED` only arrives when the recipient has
read receipts on, so `DELIVERED` counts as success.

## Sending real iMessages

The gateway needs two macOS permissions, and macOS only lets a human grant them:

| Permission | Why |
|---|---|
| **Full Disk Access** | to read `~/Library/Messages/chat.db` for delivery status |
| **Automation** | to drive Messages.app through `osascript` |

They belong to **the app hosting your terminal** (Terminal, iTerm, VS Code…),
not to `node` — adding `node` is the usual reason this silently never works.
`npm run gateway:setup` names the right app, opens the right pane, and waits
for the grant to land. Until both are in place the Dashboard shows a banner
with a **Re-check** button. If a grant does not take, quit the host app
completely and reopen it.

To keep the gateway running after you close the terminal:

```bash
npm run gateway:install     # login service via launchd; logs in ~/Library/Logs/sbta-gateway.log
npm run gateway:uninstall
```

## Commands

```bash
# run
npm run dev               # API + web
npm run dev:all           # API + web + gateway
npm run gateway:setup     # guided macOS permissions (once)
npm run gateway:real      # gateway: real iMessages
npm run gateway:mock      # gateway: simulated, no permissions
npm run gateway:install   # gateway as a login service on this Mac

# check
npm run verify            # typecheck + lint + unit tests — run before committing
npm test                  # unit tests only
npm run test:int          # integration tests against real Postgres
npm run build             # build every project

# database
npm run db:up             # start Postgres
npm run db:setup          # start + migrate + create the test database
npm run db:migrate        # apply migrations after a schema change
npm run db:studio         # browse the data
npm run db:seed           # a few sample messages
npm run db:down           # stop Postgres
```

Everything in containers except the gateway (it needs macOS):

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up --build
# web :4330, API :4310 — migrations run as a one-shot job first
```

## Configuration

One file, `.env` at the repo root, read by every app. `.env.example` documents
each variable; the ones you are most likely to touch:

| Variable | Default | |
|---|---|---|
| `GATEWAY_DRIVER` | `mock` | `applescript` for real sends |
| `GATEWAY_TOKEN` | dev value | shared secret between server and gateway — change it outside dev |
| `DEFAULT_SEND_INTERVAL_SECONDS` | `3600` | seeded once; change it live in Settings afterwards |
| `LEASE_SECONDS` | `120` | how long a claimed message may sit with a gateway before the reaper requeues it |
| `POSTGRES_PORT` / `PORT` | `5433` / `4310` | move these if they collide with something local |

## How it works

**Postgres is the queue.** Claiming a message is one raw query — the only place
the code leaves Prisma:

```sql
SELECT id FROM "messages" WHERE status = 'QUEUED'
ORDER BY "forceDispatch" DESC, "queueSeq" ASC
LIMIT 1 FOR UPDATE SKIP LOCKED
```

Any number of server instances claim *different* rows with no coordination.

**Claims are pull, not push.** Nothing dispatches on a timer. A message leaves
the queue only when a gateway asks for one, so an offline gateway cannot burn
slots.

**A lease and a reaper cover failure.** A claim holds the message for
`LEASE_SECONDS`; a sweep returns expired leases to `QUEUED`. That handles a
gateway crash, a network partition, or death mid-send.

**The same text is never sent twice.** `providerGuid` — the `chat.db` id of the
real message — is written once and survives a reap. A re-leased message that
already has one is re-attached, never re-sent. At-least-once delivery with an
idempotent consumer.

**Status reports are guarded.** They arrive duplicated, out of order, and
concurrently: the dispatch token must match the current attempt, a rank check
stops a late `SENT` overwriting `DELIVERED`, every write is a compare-and-set
so two racing reports cannot lose an update, and `(messageId, status)` is unique
so a replay collides instead of duplicating.

**Send time is derived, not chosen.** There is no date picker:
`eta(i) = max(lastDispatchedAt + interval, now) + i × interval`, computed on
read. Cancelling a message or changing the rate re-times the queue for free.

Also worth knowing: failed sends retry up to the attempt budget, spaced by the
send rate; 555 numbers are accepted (`isPossible`, not `isValid`) because the
assessment mockup uses one; message bodies are never logged.

## Project structure

Nx monorepo on npm workspaces. Four projects:

```
apps/web         React 19 · Vite · Tailwind v4 · React Query
  src/api/         server calls + React Query hooks, one file per domain
  src/screens/     one folder per route
  src/components/  shared UI
apps/server      Express 5 · Prisma 7 · Postgres
  src/http/        routes + middleware
  src/repositories/  everything that touches the database
  src/scheduler/   rate gate, queue state, the reaper
  prisma/          schema + migrations
apps/gateway     Node · osascript · chat.db        (runs natively on macOS)
  src/runner/      the claim → send → watch loop
  src/macos/       chat.db, permissions, Apple timestamps
  src/drivers/     applescript, mock
libs/shared      Zod schemas · status state machine · ETA projection
                 (the contract both sides import; types are never hand-copied)
infra/           Terraform: VPC, RDS, ECS Fargate, ALB, S3 + CloudFront
docs/specs       one spec per domain · docs/adr  the decisions that are easy to undo by accident
```

Each app has a `CLAUDE.md` with the invariants not to break; read it before
changing that app.

## Testing

```bash
npm test            # 203 unit tests — pure logic, no database, sub-second
npm run test:int    # 84 integration tests — real Postgres, own database
```

Unit tests cover the status machine, ETA projection, the rate gate, handle
normalization, the gateway's double-send guard and Apple timestamp math. The
integration suite proves what only a database can: five concurrent claims
return five different rows, the reaper reclaims abandoned leases, stale tokens
are rejected, the GUID survives a reap, and racing status reports never lose
an update. CI runs both on every pull request against a Postgres service
container, plus `terraform validate` and both Docker builds.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `localhost:4310` shows JSON, not the app | That is the API. The UI is on **4320**. |
| Queue never drains | No gateway is running — start `gateway:real` or `gateway:mock`. Or the queue is paused: check Settings. |
| Dashboard shows a permissions banner | macOS has not granted the gateway's host app. Use the banner's links, then **Re-check**. |
| Granted the permission but the banner stays | The grant only reaches processes started afterwards. Quit the host app fully and reopen. |
| `db:up` hangs or errors | Docker Desktop is not running. |
| `test:int` cannot connect | Run `npm run db:setup` first. |
| Port already in use | Something holds 4310 / 4320 / 5433 — change it in `.env`. |
| A send to an email address fails with error 22 | That address has no iMessage account. Only iMessage-reachable handles work; the gateway never falls back to SMS. |

## Deployment

GitHub → Docker → ECR → Terraform → AWS, authenticated by GitHub OIDC (no
stored keys). Terraform is validated in CI and planned by a manual release
workflow; it is never applied from this repository.

The gateway cannot run in AWS — it needs a signed-in Messages account — so it
lives on a Mac. Because it dials out, that Mac needs no inbound rules, VPN, or
public IP. Details: [`docs/specs/05-deployment.md`](docs/specs/05-deployment.md).

## Further reading

| | |
|---|---|
| [Overview](docs/specs/00-overview.md) | the system and the two decisions that shape it |
| [Shared contract](docs/specs/01-shared.md) | status machine, schemas, ETA, phone rules |
| [Server](docs/specs/02-server.md) | queue, claim, reaper, API |
| [Gateway](docs/specs/03-gateway.md) | AppleScript, `chat.db`, drivers, permissions |
| [Web](docs/specs/04-web.md) | structure, server state, design decisions |
| [Deployment](docs/specs/05-deployment.md) | Docker, CI, Terraform, AWS |
| [ADR 0001](docs/adr/0001-postgres-as-the-queue.md) | Postgres as the queue |
| [ADR 0002](docs/adr/0002-no-message-broker.md) | why there is no message broker |
| [ADR 0003](docs/adr/0003-pull-based-gateway.md) | why the gateway dials out |
