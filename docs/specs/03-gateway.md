# iMessage gateway (`apps/gateway`)

A long-running Node process that runs **natively on a Mac**. It cannot be
containerized: it needs Messages.app, a signed-in Apple account, and read access
to `chat.db`.

## The loop

```
heartbeat ──▶ GET /lease?wait=25 ──▶ (204: ask again)
                    │
                    ▼ 200
              report ACCEPTED
                    │
       providerGuid already set? ──yes──▶ re-attach, do NOT re-send
                    │ no
                    ▼
              driver.send()  ──▶ report SENT + GUID
                    │
                    ▼
              driver.watch() ──▶ DELIVERED ─▶ RECEIVED   (background)
```

Watching is deliberately **not awaited**. A read receipt can take minutes or
never arrive; blocking the loop on one would stall the queue behind a message
nobody is going to open.

## Why the gateway dials out

Nothing ever connects *to* this process. It works from a laptop behind NAT with
no inbound rules, no port forwarding, no public IP, and no VPN.

That is a convenience locally and a requirement in production: the server runs in
AWS and the Mac does not. The transport chosen for local simplicity is the same
thing that makes the deployed topology work at all.

## Drivers

Selected by `GATEWAY_DRIVER`. Both implement one interface:

```ts
interface MessageDriver {
  capabilities(): Promise<DriverCapabilities>;   // reported, never thrown
  send(to, body): Promise<{ providerGuid, sentAt }>;
  watch(guid, onStatus): Unsubscribe;
}
```

`capabilities()` replaces an earlier `preflight()` that threw. Permissions are
granted by a human at an unpredictable moment, so the gateway stays up,
publishes what is missing through its heartbeat, re-probes every 3s while
blocked, and starts claiming the instant both appear. The dashboard renders
that state and offers a re-check that waits for a genuinely newer probe.

### `applescript` — the real one

**Sending.** `osascript` against Messages.app, targeting the iMessage service
explicitly rather than letting Messages choose, so a number with an SMS route
does not silently go out green.

**Correlation.** AppleScript returns nothing useful about what it sent, so the
message must be *found*: an outgoing row, to this handle, created no earlier than
the moment just before the send. Text is compared when `chat.db` has it — on
recent macOS `text` is often `NULL` because the body lives in `attributedBody` as
a binary plist — so it narrows the match rather than gating it.

If correlation fails after ~5s the send is reported `FAILED`. The message very
likely went out, but recording no GUID is the safe choice: `FAILED` is visible
and retryable, whereas a silently untracked message is not.

**Watching.** Polling, because `chat.db` offers no change notification and a
filesystem watcher on a WAL database fires constantly without saying what changed.

**Reading `chat.db` safely.** Messages.app holds the database open in WAL mode.
Reading the main file alone can miss recent writes still sitting in `-wal`, so all
three files (`.db`, `-wal`, `-shm`) are copied to a temp directory and the copy is
opened read-only. This also guarantees we can never interfere with Messages.app.

Queries shell out to the system `sqlite3` binary with `-json`. macOS always has
it, and it avoids a native module that would need compiling on every machine.

**Apple timestamps.** `date`, `date_delivered` and `date_read` are **nanoseconds
since 2001-01-01 UTC**, not a Unix epoch:

```
unixSeconds = appleNanoseconds / 1e9 + 978307200
```

Very old rows store seconds instead, so magnitude decides the unit.

### `mock` — what makes the project reviewable

Simulates the same lifecycle on timers. Not a test stub bolted on afterwards: it
is what lets someone who is not on a Mac, has not granted Full Disk Access, and
would rather not text a real phone run the entire system end to end. It also
powers the integration suite in CI.

`MOCK_FAILURE_RATE` injects send failures so the unhappy path — `FAILED`, then
retry from the dashboard — can be demonstrated on demand. Read receipts fire only
~50% of the time, because a mock that always reached `RECEIVED` would paint a
rosier picture than the real thing ever does.

## `RECEIVED` frequently never arrives

It requires the recipient to have read receipts enabled, which most people do
not. `DELIVERED` is therefore treated as a legitimate success end-state
throughout: in the stats, in the badge styling, and in the watch timeout.

This is a property of iMessage, not a gap in the implementation.

## macOS permissions

Two are needed: **Full Disk Access** (to read `chat.db`) and **Automation** (to
drive Messages via `osascript`).

Neither can be granted programmatically — TCC exists precisely to require a
human. So `macos/permissions.ts` and `cli/doctor.ts` automate everything
*around* the click instead:

**Naming the right application.** TCC attributes a child process's access to the
*responsible* application, so adding `node` to Full Disk Access does nothing;
the user has to add whatever hosts the shell. `detectHostApp()` walks the process
ancestry for an `.app` bundle, falling back to `__CFBundleIdentifier` and then
`TERM_PROGRAM`. Naming the wrong app is the most common way this setup fails,
and it fails silently.

**Opening the right pane.** `x-apple.systempreferences:` URLs jump straight to
Full Disk Access or Automation, and the host app is revealed in Finder so it can
be dragged into the list.

**Detecting the grant.** A new permission sometimes reaches an already-running
process and sometimes does not, depending on when TCC last cached the decision.
Rather than asking the user to guess whether a restart is needed, the doctor
polls the real check — reading `chat.db` — and reports the moment it succeeds.

`gateway:real` runs the same checks through `capabilities()` and keeps running
while something is missing, so it self-heals rather than failing at 3am on the
first real send.

Guiding is skipped when `CI` is set (or `SBTA_NO_GUIDE=1`) — deliberately not a
TTY check, since task runners pipe stdout and would silently downgrade the
guided flow to a wall of text at exactly the moment it is most useful.

## Layout

```
src/
  main.ts          start; SIGTERM finishes the current send, then exits (10s cap)
  config.ts        env schema, VERSION from package.json
  runner/          createRunner (loop + heartbeat), handleLease, createWatchers
  server/          client.ts -- the only HTTP to the server
  drivers/         applescript, mock
  macos/           chat.db, permissions, host app detection, Apple timestamps
  cli/             the guided permission setup
  launchd/         LaunchAgent template
```

No classes: long-lived state lives in `create*()` closures, matching the server.
`handleLease` takes its dependencies as arguments, which is what lets the
double-send guard be unit-tested against a fake driver without a Mac.

## Running it as a service

`npm run gateway:install` builds the bundle and installs a user LaunchAgent that
starts at login, restarts on crash, and stops cleanly on SIGTERM. Under launchd
there is no terminal application to hold the TCC grants, so Full Disk Access and
Automation are granted to the `node` binary itself; the script prints the path,
and the dashboard banner shows what is still missing.
