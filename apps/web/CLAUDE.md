# apps/web

React 19 + Vite + Tailwind v4 + shadcn-style primitives.

## Rules specific to this app

- **Form validation uses the shared schema.** `createMessageSchema` from
  `@sb/shared` via `zodResolver`. Never redefine validation rules here.
- **All query keys live in `lib/query-keys.ts`.** Never inline an array literal
  in a `useQuery` call — invalidation silently stops matching.
- **There is no WebSocket or SSE.** Server state is polled. If you add push,
  change it inside the query layer only.
- **No date picker.** The mockup has none, and send times are derived from queue
  position. `IntervalNotice` explains this to the user; keep that explanation.
- **Status is never colour alone.** Dot + label + border.
- **Wide content scrolls inside its own container**, never the page body.

## Structure

Feature-sliced: `features/<name>/{api.ts, components/, index.tsx}`. A new
capability is a new folder, not edits scattered through shared files.

`components/ui/` holds shadcn primitives; `components/` holds app-level composites.

## Theming

Tokens in `styles.css` define light and dark. The palette is Apple's system
colours. Add colours as tokens, never as literals in a component.

`tsconfig.json` sets its own `baseUrl` so `@/*` resolves against this app rather
than the repo root.
