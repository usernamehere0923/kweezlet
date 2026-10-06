# kweezlet

Quizlet-style flashcard app. React + Tailwind UI, Cloudflare Worker (Hono) API, D1 (SQLite) database, one Durable Object for live sync. Everything runs locally; no account needed for dev.

## Commands

- `npm run dev`: app + API + database on http://localhost:5173. Login `demo` / `demo`.
- `npm run dev -- --host`: same, reachable from the iPhone at `http://<mac-ip>:5173` (same wifi).
- `npm test`: worker tests (real Workers runtime). `npm run check`: types + lint + format. **Run both before every commit.**
- `npm run format`: fix formatting.
- `npm run db:migrate`: apply new migrations locally. `npm run db:reset`: wipe local DB, re-migrate, re-create demo.
- `npm run user:add -- <name> <password> [--remote]`: create user / reset password. No registration in the app.
- `npm run deploy`: build + upload. Before: `npm run db:migrate:remote` if there are new migrations.
- `npm run types`: after changing `wrangler.jsonc`.
- `npm run gen:icons` / `npm run gen:og`: after changing `assets/icons/*` or `assets/og/card.html`.

## Rules

### Look

- Build screens ONLY from `src/ui` (`import { Button, Card, FlipCard } from "../ui"`). The `/design` page shows every piece with a snippet.
- Colours and fonts only via the tokens in `src/index.css` `@theme` (`bg-surface`, `text-muted`, `border-line`, `font-serif`...). No `#hex`, no new colours, no dark mode.
- One orange (primary) button per screen. Teal = secondary/links. Green/red only for correct/wrong.
- Missing a component? Add it to `src/ui` (or `src/ui/study`), export it from `index.ts`, show it on `/design`.
- Mobile first: check every screen at 390px wide. Inputs stay `text-base` (16px) or iOS zooms in.

### Text

- Every visible string goes through `t("key")` / `tn("key", count)` from `useT()`. Add the key to `src/i18n/en.ts` AND `src/i18n/de-CH.ts` (the build fails otherwise).
- German = Swiss: "ss", never the sharp s. No gendered forms ("der Nutzer", not "Nutzer:innen").

### Database

- Schema changes = a NEW file `migrations/000N_name.sql`. Never edit a migration that already ran.
- Every business table has `user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE`.
- Every query on user data has `WHERE user_id = ?` bound to `c.get("user").id`. Never trust a `user_id` from the request.
- Every table with `user_id` goes into `exportTables` in `worker/export.ts` ("Download my data"). A test fails if one is missing.
- Values always via `.bind(...)`, never pasted into SQL strings.
- Full-text search: D1 supports SQLite FTS5 (virtual table + triggers). Not built yet.

### API

- Routes live in `worker/*.ts`, mounted in `worker/index.ts` by chaining (`.route(...)`), so the UI gets their types.
- Everything under `/api/*` needs a login automatically (`requireUser`); only paths in `PUBLIC_PATHS` (`worker/auth.ts`) don't.
- Validate every body/query with `validate("json", zodSchema)` from `worker/validate.ts`. Errors come back as `{ error: "validation", fields: { name: "too_small" } }`; show them with `fieldErrors(res)` + `t()`.
- The UI calls the API only through `api` from `src/lib/api.ts` (typed). 401 and server errors are handled there.
- After a write the user's other devices should see: `await notify(c.env, user.id, "topic")` in the worker, `useLive("topic", reload)` in the page.
- Example of the full pattern (table, scoped route, export): `test/ownership.test.ts`.

### Before asking for anything new

- Card images: no R2 (it needs a credit card). Ask before picking an image approach.
- Sharing sets between users breaks the "only your own rows" rule on purpose. Ask first.
- New dependencies: ask first.

### Fonts

The Anthropic fonts in `src/fonts` are fine for this private app. If kweezlet ever goes public as a product, switch `--font-*` in `src/index.css` to free fonts (Inter, Source Serif, JetBrains Mono) and delete the files. Never use Claude's name or logo.

## Deploy (once)

1. `npx wrangler login` (your own Cloudflare account, free, no card).
2. `npx wrangler d1 create kweezlet`, put the printed `database_id` into `wrangler.jsonc`.
3. `npm run db:migrate:remote`, `npm run user:add -- <you> '<password>' --remote`.
4. `npm run deploy`, then put the printed URL into `.env.production` as `PUBLIC_URL` and deploy again (link previews need it).
5. On the iPhone: open the URL in Safari, Share, "Add to Home Screen".
