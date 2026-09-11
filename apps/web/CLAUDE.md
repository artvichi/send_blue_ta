# apps/web

React 19 + Vite + Tailwind v4 + shadcn-style primitives.

## Rules specific to this app

- **Form validation uses the shared schema.** `createMessageSchema` from
  `@sb/shared` via `zodResolver`. Never redefine validation rules here.
- **All query keys live in `api/keys.ts`.** Never inline an array literal
  in a `useQuery` call — invalidation silently stops matching.
- **There is no WebSocket or SSE.** Server state is polled. If you add push,
  change it inside the query layer only.
- **Keep `refetchIntervalInBackground: true`.** React Query pauses polling for a
  hidden tab by default; this dashboard is meant to be left open on a second
  monitor, and without the override it silently freezes when unfocused.
- **No date picker.** The mockup has none, and send times are derived from queue
  position. `IntervalNotice` explains this to the user; keep that explanation.
- **Status is never colour alone.** Dot + label + border.
- **The recipient field always holds a plain handle.** `RecipientPicker` is a
  convenience over the input, not a new data path: choosing a name writes the
  handle into the form, and the form submits what it always did.
- **Wide content scrolls inside its own container**, never the page body.

## Structure

Two axes, deliberately kept separate:

- **`api/` is split by domain**, mirroring `libs/shared/src/schemas/` —
  `messages`, `settings`, `stats`, `gateway`, plus `client.ts` (transport) and
  `keys.ts`. A hook goes in the module matching the *data* it touches, never the
  screen that happens to call it. Components import from `@/api/<domain>`.
- **`screens/` is split by route**, flat, one folder per page.

`components/` is only for things used by more than one screen; `components/ui/`
holds the shadcn primitives. A component used by exactly one screen lives beside
it — promoting it early is what turns `components/` into a drawer.

`hooks/` is for generic React hooks (`use-now`, `use-theme`). Data hooks belong
in `api/`, not here.

## Theming

Tokens in `styles.css` define light and dark. The palette is Apple's system
colours. Add colours as tokens, never as literals in a component.

`tsconfig.json` sets its own `baseUrl` so `@/*` resolves against this app rather
than the repo root.
