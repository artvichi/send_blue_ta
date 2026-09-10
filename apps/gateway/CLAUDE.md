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
- **`preflight()` must fail loudly and actionably.** Both failure modes need a
  human to click something in System Settings; say which.
- **Never log message bodies.**

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

`npm run gateway:setup` runs the guided flow; `preflight()` calls the same doctor
so `gateway:real` self-heals. Guiding is gated on `CI`, not on `isTTY` — task
runners pipe stdout, and a TTY check silently disables the guidance exactly when
it is needed.
