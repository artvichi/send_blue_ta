# apps/gateway

Runs natively on macOS. Cannot be containerized — it needs Messages.app, a
signed-in Apple account, and read access to `chat.db`.

## Rules specific to this app

- **Check `lease.providerGuid` before sending.** Non-null means a previous
  attempt already sent this message and only its status report was lost.
  Re-sending would text a real person twice.
- **Never await `watch()`.** A read receipt can take minutes or never arrive;
  awaiting it would stall the queue.
- **Copy `chat.db` before reading it.** All three files (`.db`, `-wal`, `-shm`).
  Messages.app holds it open in WAL mode, so reading the main file alone can miss
  recent writes.
- **Apple timestamps are nanoseconds since 2001-01-01**, not Unix:
  `unix = appleNs / 1e9 + 978307200`. Getting this wrong shifts everything by 31 years.
- **`capabilities()` reports, it never throws.** The permissions are granted by
  a human at an unpredictable moment; the gateway stays up, publishes what is
  missing through the heartbeat, and starts claiming when both appear.
- **Never log message bodies.**
- **No classes.** Modules export functions; long-lived state lives in a
  `create*()` closure (`createRunner`, `createWatchers`, `createDriver`), the
  same shape the server uses. Error subclasses are the one exception -- that is
  how `instanceof` works.

## Structure

```
src/
  main.ts            start, and a bounded graceful shutdown
  config.ts          env schema; VERSION from package.json
  runner/            the loop
    index.ts           createRunner: claim -> handleLease, heartbeat, blocked-state probing
    lease.ts           one lease: ack, double-send guard, send, hand to watchers
    watchers.ts        background delivery watchers, cancellable on shutdown
  server/client.ts   the only place that talks HTTP to the server
  drivers/           MessageDriver implementations: applescript, mock
  macos/             everything platform-specific: chat.db, permissions, host app, Apple time
  cli/               gateway:setup -- the guided permission doctor
  launchd/           the LaunchAgent template installed by scripts/gateway-install.sh
```

`runner/lease.ts` takes its dependencies as arguments so the double-send guard
is unit-tested against a fake driver (`lease.spec.ts`). Keep it that way.

## Drivers

`mock` is not a test stub — it is what lets a non-Mac reviewer run the whole
system, and it powers CI. Keep it behaviourally honest: read receipts fire only
sometimes, because that is what real iMessage does.

Adding a driver means implementing `MessageDriver` and adding a case to
`createDriver()`; the `never` in the default branch makes a missed case a compile
error.

## Permissions

- Full Disk Access → `chat.db`
- Automation → `osascript`

Both belong to the *application hosting the terminal*, never to `node`. That is
what `detectHostApp()` exists to work out, and getting it wrong sends the user to
tick a box that grants nothing.

`npm run gateway:setup` runs the guided flow. Guiding is gated on `CI`, not on
`isTTY` — task runners pipe stdout, and a TTY check silently disables the
guidance exactly when it is needed.

Under launchd (`npm run gateway:install`) there is no terminal app, so the
grants belong to the `node` binary itself — the one case where "add node" is
the right instruction. The install script prints the exact path.
