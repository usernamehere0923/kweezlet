# kweezlet

Quizlet-style flashcard app. React + Tailwind UI, Cloudflare Worker (Hono) API, D1 database, one Durable Object for live sync.

## Commands

- `npm run dev`: http://localhost:5173, login `demo` / `demo`. User starts it via `Start kweezlet.command`. Endless load after a config change → `npm run dev -- --force`. iPhone (same wifi) → `-- --host`.
- `npm run db:reset` wipes all local data: only when the user asks to start over. Wrong demo password → `npm run user:add -- demo demo`. No registration in the app: users only via `user:add [--remote]`.
- `npm run deploy` ships GitHub's `master` only (`scripts/release.sh`), never the current branch; it dumps the live DB to `backups/` itself. Never ask the user to back up first. Migrations stay additive: old code runs against the new schema until the upload lands.
- After changing `wrangler.jsonc` → `npm run types`; `assets/icons/*` / `assets/og/card.html` → `gen:icons` / `gen:og`.

Pinned, don't bump: vitest 4.x (`@cloudflare/vitest-pool-workers` needs it), TypeScript 6.x (`typescript-eslint` rejects 7), `compatibility_date`.

## Look

- Screens ONLY from `src/ui`; `/design` shows every piece. Missing one → add to `src/ui`, export, show on `/design`.
- Styling only via theme tokens; `#hex` only in `src/themes/*.css`. No auto dark mode.
- One primary (`accent`) button per screen. Teal = secondary/links. Green/red only for correct/wrong.
- Progress animates ONLY via `ProgressBar` (exception: `ResultSummary` score ring). Other motion only via `--animate-*` tokens inside `src/ui`, never hand-made on a page. Confetti only for a real win.
- Mobile first, 390px. Inputs stay `text-base` (16px) or iOS zooms in.
- Visible change → Playwright (chromium, 390px) on the running app, look at a screenshot. Green tests are not "done".

## Text

- Every visible string via `t()` / `tn()`, key in `en.ts` AND `de-CH.ts`.
- German = Swiss: "ss", never the sharp s. No gendered forms ("der Nutzer", not "Nutzer:innen").

## Database

- No staging: `deploy` and `db:migrate:remote` change the user's real cards. Mistake → new migration; last resort D1 Time Travel (7 days). Never edit a migration that already ran.
- Every business table: `user_id ... REFERENCES users (id) ON DELETE CASCADE`. Every query: `WHERE user_id = ?` bound to `c.get("user").id`, never a `user_id` from the request. Values only via `.bind()`.
- Table with `user_id` → `exportTables` in `worker/export.ts` (a test enforces it) + demo rows in `scripts/seed.ts`.
- Full pattern (table, scoped route, export): `test/ownership.test.ts`.

## API

- Routes mounted in `worker/index.ts` by chaining `.route(...)`, else the UI loses their types.
- `/api/*` needs login except `PUBLIC_PATHS`. Validate with `validate(...)`; show errors with `fieldErrors(res)` + `t()`. UI calls only through `api` (`src/lib/api.ts`).
- Secrets (`ZAI_API_KEY`) only in the worker env: never in code, a response, a log the UI sees, or a `VITE_` var. AI failures reach the UI as `ZaiErrorKind`, never z.ai's message.
- Write other devices should see → `notifyLater(c, "topic")` + `useLive("topic", reload)`.

## Git

- Session start: `git fetch origin`; `git pull --ff-only` if on clean `master`, else read `origin/master`. Never switch branches, stash or reset for it: other sessions merge PRs.
- One branch + PR per phase, merge commit when green, delete branch. Docs/formatting fixes may go straight to `master`.
- No worktrees (except the throwaway one `release.sh` makes). `master` is protected: no force-push.
- Commit + push after every working step (`check` + `test` green). Message: what changed, plain words.

## Tests

- CI: 95% lines overall, 75% of changed lines. Red → write the test, never lower a number.
- Worker → `test/*.test.ts`. UI → `*.test.tsx` next to the code. Query by role/label.

## Ask first

- Card images: no R2 (needs a credit card).
- Sharing sets between users (breaks "only your own rows" on purpose).
- New dependencies.
- PWA = installable only. No service worker, no offline: decided, don't build or suggest it.
