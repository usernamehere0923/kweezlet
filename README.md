# kweezlet

A Quizlet-style flashcard app, built as a learning project: learning to build a real web app end to end, from database to phone home screen. Not a product, no sign-up; accounts are created by hand.

- UI: React + Tailwind, installable on the iPhone home screen
- API: Cloudflare Worker (Hono), D1 (SQLite), one Durable Object for live sync between devices
- Languages: English and Swiss German

## Run it locally

Needs a current Node.js (`brew install node` on a Mac; CI uses Node 26). No Cloudflare account needed: the Worker, database and live sync all run on your machine.

```sh
npm install
npm run db:reset   # create the local database and the demo user
npm run dev        # http://localhost:5173, log in with demo / demo
```

- On your phone (same wifi): `npm run dev -- --host`, then open `http://<your-mac-ip>:5173`.
- Page loads forever after a config change: `npm run dev -- --force`.
- More local users: `npm run user:add -- <name> <password>`.

Before every commit:

```sh
npm run check           # types, lint, format (npm run format fixes formatting)
npm run test:coverage   # worker + UI tests, fails under 75% line coverage
```

First-time setup on a fresh Mac, step by step: [SETUP.md](SETUP.md).

## Deploy to Cloudflare

Free plan, no credit card. Everything runs with `wrangler`, which `npm install` already brought along.

### Once

1. Log in to your Cloudflare account:
   ```sh
   npx wrangler login
   ```
2. Create the database and put the printed `database_id` into `wrangler.jsonc` (it is all zeros until then):
   ```sh
   npx wrangler d1 create kweezlet
   ```
3. Create the tables and your user in the live database:
   ```sh
   npm run db:migrate:remote
   npm run user:add -- <you> '<password>' --remote
   ```
4. Deploy, then put the printed URL into `.env.production` as `PUBLIC_URL` (link previews need it) and deploy again:
   ```sh
   npm run deploy
   ```
5. On the iPhone: open the URL in Safari, Share, "Add to Home Screen".

### Every update

```sh
npm run deploy
```

If the update has new files in `migrations/`, apply them first. There is no staging: this changes your real cards. **Before running it, open the live app and tap Settings → "Download my data".**

```sh
npm run db:migrate:remote
npm run deploy
```

Something went wrong in the live database: fix it with a new migration. Last resort: D1 Time Travel restores the database up to 7 days back (Cloudflare dashboard → D1 → kweezlet).

## More

Rules for working on the code: [AGENTS.md](AGENTS.md).
