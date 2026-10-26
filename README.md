# kweezlet

A Quizlet-style flashcard app, built as a learning project: learning to build a real web app end to end, from database to phone home screen. Not a product, no sign-up; accounts are created by hand.

- UI: React + Tailwind, installable on the iPhone home screen
- API: Cloudflare Worker (Hono), D1 (SQLite), one Durable Object for live sync between devices
- Languages: English and Swiss German

## Run it locally

### What you need

- Apple developer tools (`xcode-select --install`): git and compilers
- [Homebrew](https://brew.sh), then `brew install node` (current Node.js; CI uses 26)
- git with your name and email (`git config --global user.name` / `user.email`)

Fresh Mac? [SETUP.md](SETUP.md) walks through all of it step by step. No Cloudflare account needed: the Worker, database and live sync all run on your machine.

### Start

Once:

```sh
npm install
npx playwright install chromium # browser for checking screens
npm run db:migrate              # create the local database
npm run user:add -- demo demo   # create the demo user
echo 'ZAI_API_KEY=<your key>' > .dev.vars   # z.ai key for the AI features
```

The z.ai key comes from <https://z.ai/manage-apikey/apikey-list>. Without it everything works except "From material" (it fails with "the AI key is missing"). The key is only in `.dev.vars` on this machine and in a Cloudflare secret when deployed; never in the code.

No key yet, or trying screens without paying: add `ZAI_FAKE=1` to `.dev.vars`. A stand-in AI then makes cards from the material itself (pairs like "el perro — the dog" and sentences), after a few seconds, at no cost. It only works on the local dev server; anywhere else the AI routes refuse to run while it is set.

Every day:

```sh
npm run dev   # http://localhost:5173, log in with demo / demo
```

Or double-click `Start kweezlet.command`: it applies new migrations, then starts the app and opens the browser.

The local database lives in `.wrangler/state/` and keeps everything between restarts (sets, settings, users).

- On your phone (same wifi): `npm run dev -- --host`, then open `http://<your-mac-ip>:5173`.
- Page loads forever after a config change: `npm run dev -- --force`.
- More local users, or a forgotten password: `npm run user:add -- <name> <password>`.
- New file in `migrations/`: `npm run db:migrate`. Keeps your data.
- Start over from an empty database: `npm run db:reset`. **Deletes all local data**, then re-creates `demo`.

Before every commit:

```sh
npm run check           # types, lint, format (npm run format fixes formatting)
npm run test:coverage   # worker + UI tests, fails under 95% line coverage
```

## Deploy to Cloudflare

Free plan, no credit card. Everything runs with `wrangler`, which `npm install` already brought along.

### Once

1. Log in to your Cloudflare account:
   ```sh
   npx wrangler login
   ```
2. Create the database and put the printed `database_id` into `wrangler.jsonc` (it is all zeros until then). Commit it to `master` and push: deploys only ship GitHub's `master`.
   ```sh
   npx wrangler d1 create kweezlet
   ```
3. Create the tables and your user in the live database:
   ```sh
   npm run db:migrate:remote
   npm run user:add -- <you> '<password>' --remote
   ```
4. Give the live Worker the z.ai API key for the AI features (from <https://z.ai/manage-apikey/apikey-list>). The monthly spending cap is the `AI_MONTHLY_CAP_USD` var in `wrangler.jsonc` (default 2 dollars):
   ```sh
   npx wrangler secret put ZAI_API_KEY
   ```
5. Deploy, then put the printed URL into `.env.production` as `PUBLIC_URL` (link previews need it), commit it to `master`, push and deploy again:
   ```sh
   npm run deploy
   ```
6. On the iPhone: open the URL in Safari, Share, "Add to Home Screen".

### Every update

```sh
npm run deploy
```

`npm run deploy` and `npm run db:migrate:remote` always ship GitHub's `master`, from whatever branch you are on. They fast-forward your local `master` first and build in a temporary folder, so a feature branch and its unsaved changes stay as they are (only a checked-out `master` gets the new commits). Local `master` with commits not on GitHub: they stop.

If the update has new files in `migrations/`, apply them first. There is no staging: this changes your real cards. **Before running it, open the live app and tap Settings → "Download my data".**

```sh
npm run db:migrate:remote
npm run deploy
```

Something went wrong in the live database: fix it with a new migration. Last resort: D1 Time Travel restores the database up to 7 days back (Cloudflare dashboard → D1 → kweezlet).

## More

Rules for working on the code: [AGENTS.md](AGENTS.md).
