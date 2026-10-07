# kweezlet

Quizlet-style flashcard app. React + Tailwind UI, Cloudflare Worker (Hono) API, D1 (SQLite) database, one Durable Object for live sync.

## Commands

- `npm run dev`: app + API + database on http://localhost:5173. Login `demo` / `demo`. He usually starts it by double-clicking `Start kweezlet.command`. Page loads forever after a config change → restart with `npm run dev -- --force`.
- `npm run dev -- --host`: same, reachable from the iPhone at `http://<mac-ip>:5173` (same wifi).
- `npm test`: worker (Workers runtime) + UI (jsdom) tests. `npm run check`: types + lint + format; `npm run format` fixes formatting.
- `npm run db:migrate`: apply new migrations locally, keeps data. `npm run db:reset` wipes all his local data: only when he asks to start over. Wrong demo password → `user:add -- demo demo`.
- `npm run user:add -- <name> <password> [--remote]`: create user / reset password. No registration in the app.
- `npm run deploy`: build + upload (setup: `README.md`). New migrations → `db:migrate:remote` first.
- `npm run types`: after changing `wrangler.jsonc`.
- `npm run gen:icons` / `npm run gen:og`: after changing `assets/icons/*` or `assets/og/card.html`.

Pinned on purpose, don't bump: vitest 4.x (`@cloudflare/vitest-pool-workers` needs it), TypeScript 6.x (`typescript-eslint` rejects 7), `compatibility_date` (see `wrangler.jsonc`).

## Rules

### Look

- Build screens ONLY from `src/ui` (`import { Button, Card, FlipCard } from "../ui"`). The `/design` page shows every piece with a snippet.
- Colours and fonts only via the tokens in `src/index.css` `@theme` (`bg-surface`, `text-muted`, `border-line`, `font-serif`...). No `#hex`, no new colours, no dark mode.
- One orange (primary) button per screen. Teal = secondary/links. Green/red only for correct/wrong.
- Missing a component? Add it to `src/ui` (or `src/ui/study`), export it from `index.ts`, show it on `/design`.
- Mobile first, 390px wide. Inputs stay `text-base` (16px) or iOS zooms in.
- Visible change → drive the running app with Playwright (chromium, 390px), look at a screenshot. Green tests alone are not "done".

### Text

- Every visible string goes through `t("key")` / `tn("key", count)` from `useT()`. Add the key to `src/i18n/en.ts` AND `src/i18n/de-CH.ts` (the build fails otherwise).
- German = Swiss: "ss", never the sharp s. No gendered forms ("der Nutzer", not "Nutzer:innen").

### Database

- Schema changes = a NEW file `migrations/000N_name.sql`. Never edit a migration that already ran.
- There is no staging: `db:migrate:remote` changes his real cards. Before telling him to run it, remind him to tap Settings → "Download my data" on the live app first. Mistake afterwards → fix with a new migration; last resort: D1 Time Travel (restore up to 7 days back).
- Every business table has `user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE`.
- Every query on user data has `WHERE user_id = ?` bound to `c.get("user").id`. Never trust a `user_id` from the request.
- Every table with `user_id` goes into `exportTables` in `worker/export.ts` ("Download my data"). A test fails if one is missing.
- Values always via `.bind(...)`, never pasted into SQL strings.

### API

- Routes live in `worker/*.ts`, mounted in `worker/index.ts` by chaining (`.route(...)`), so the UI gets their types.
- Everything under `/api/*` needs a login automatically (`requireUser`); only paths in `PUBLIC_PATHS` (`worker/auth.ts`) don't.
- Validate every body/query with `validate("json", zodSchema)` from `worker/validate.ts`. Errors come back as `{ error: "validation", fields: { name: "too_small" } }`; show them with `fieldErrors(res)` + `t()`.
- The UI calls the API only through `api` from `src/lib/api.ts` (typed). 401 and server errors are handled there.
- After a write the user's other devices should see: `await notify(c.env, user.id, "topic")` in the worker, `useLive("topic", reload)` in the page.
- Example of the full pattern (table, scoped route, export): `test/ownership.test.ts`.

### Git

- Work only on `master`: no feature branches, no worktrees, no PRs. He doesn't know them.
- Commit after every step that works (`check` + `test` green), not one big commit at the end. Message: what changed, in plain words. Then push.

### Tests and coverage

- CI checks every push to `master`: `test:coverage` floor 95% lines (`vitest.config.ts`), 75% of changed lines (`scripts/patch-coverage.sh`). Red → write the test, never lower a number.
- Worker → `test/*.test.ts`. UI → `*.test.tsx` next to the code, helpers in `src/test/`. Query by role/label.

### Before asking for anything new

- Card images: no R2 (it needs a credit card). Ask before picking an image approach.
- Sharing sets between users breaks the "only your own rows" rule on purpose. Ask first.
- New dependencies: ask first.
- PWA = installable only (`public/manifest.webmanifest`, icons). No service worker, no offline support: decided, don't build or suggest it.

### Fonts

The Anthropic fonts in `src/fonts` are fine for this private app. If kweezlet ever goes public as a product, switch `--font-*` in `src/index.css` to free fonts (Inter, Source Serif, JetBrains Mono) and delete the files. Never use Claude's name or logo.
