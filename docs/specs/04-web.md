# Scheduling UI (`apps/web`)

React 19 + Vite + TypeScript + Tailwind v4, with shadcn-style primitives.

## Layout

```
src/
  features/
    scheduler/   compose form + live queue   (the mockup screen)
    dashboard/   tiles, table, timeline, health
    settings/    send-rate control
  components/ui/ shadcn primitives
  lib/           api client, query keys, formatters
```

Feature-sliced, so a new capability arrives as a new folder rather than as edits
spread across shared files.

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
