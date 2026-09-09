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
  preflight(): Promise<void>;
  send(to, body): Promise<{ providerGuid, sentAt }>;
  watch(guid, onStatus): Unsubscribe;
}
```

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

`preflight()` fails at startup with an actionable message rather than at 3am on
the first real send. Both failure modes need a human to click something:

- **Full Disk Access** for `chat.db` → System Settings → Privacy & Security
- **Automation** for `osascript` → System Settings → Privacy & Security

Grant them to the *terminal application* running the gateway, then restart it.
