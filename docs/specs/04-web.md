# Scheduling UI (`apps/web`)

React 19 + Vite + TypeScript + Tailwind v4, with shadcn-style primitives.

## Layout

```
src/
  api/           the server boundary, split by domain
    client.ts      HTTP transport + ApiError
    keys.ts        every query key + poll rates
    messages.ts    queue, history, schedule/cancel/send-now/retry/clear
    settings.ts    read + patch the send rate and retry budget
    stats.ts       tiles + activity chart
    gateway.ts     health, and the permission re-check
    recipients.ts  the address book
  screens/       one folder per route, flat
    dashboard/     tiles, chart, table, timeline
    scheduler/     compose form + live queue   (the mockup screen)
    recipients/    the address book
    settings/      send-rate and retry controls
  components/    shared across screens
    recipient-picker.tsx   the compose field: searches recipients as you type
    ui/            shadcn primitives
  hooks/         generic React hooks (clock, theme)
  lib/           formatters, class helper
```

**The data layer is split by domain, the view layer by screen.** These are two
different axes and conflating them is what the earlier `features/<name>/api.ts`
layout got wrong: message hooks lived in two folders (`useQueue` under
scheduler, `useMessages` under dashboard) purely because of which screen needed
them first, and three shared components had already reached across a "feature"
boundary that was therefore fiction.

`api/` mirrors `libs/shared/src/schemas/` one-for-one — message, settings, stats,
gateway — so the same domain has the same name on both sides of the wire.

A component earns a place in `components/` by being used from more than one
screen. Everything else stays next to the screen that owns it, which is what
keeps `components/` meaningful rather than a drawer.

## Server state

React Query, polled. There is no WebSocket and no SSE anywhere in this system —
combined with the gateway's long-poll, that means **one transport concept, plain
HTTP end to end**. Fewer moving parts to explain and fewer failure modes.

Every query key lives in `lib/query-keys.ts`. Centralizing them keeps
invalidation honest, and it is the seam that would confine a future swap to SSE
to the query layer alone.

Poll rates are matched to what a person is actually watching: the queue every 2s,
stats every 3s, gateway health every 5s. Settings do not poll at all — they change
only when someone changes them, so invalidation covers it.

`refetchIntervalInBackground` is enabled, overriding a React Query default that
is right for most apps and wrong for this one. By default polling pauses for a
hidden tab; a queue dashboard, though, is something you leave open on a second
monitor and glance at. Without the override it silently freezes the moment it
loses focus and only catches up when clicked, which reads as broken — and it did:
this was caught by watching the drain in an unfocused window. The cost is a few
small JSON requests.

## Validation

`react-hook-form` with `zodResolver` against the **same schema the server uses**.
The rules cannot drift, because there is only one copy of them.

## Why there is no date picker

The mockup does not have one, and the queue is FIFO at a fixed drain rate, so a
message's send time is a consequence of its position rather than an input.

Because that is genuinely non-obvious, the screen says so: a line under the form
states the current rate and links the reader to where it can be changed. Design
decisions that need explaining are better explained in the UI than in a README
nobody opens.

## Details that matter

- **Live countdowns.** One 1s timer drives every countdown on the page, rather
  than one timer per row.
- **The head of the queue is marked.** An accent rail and a "Next" pill, because
  "which one goes out next" is the first question anyone asks.
- **ETAs recalculate themselves.** They are derived server-side, so cancelling a
  message or changing the interval re-times the whole queue with no client logic.
- **Row actions appear on hover and on focus.** Hover-only would be unreachable
  by keyboard.
- **Status is colour and shape.** A dot plus a label plus a border, never colour
  alone.
- **Wide content scrolls in its own container.** The dashboard table scrolls
  horizontally inside its card; the page body never does.

## Theming

Light and dark, both defined as tokens in `styles.css`. The palette is Apple's
own system colours — the blue of an iMessage bubble and the greens, ambers and
reds macOS uses for state — so a status colour reads correctly without a legend.
