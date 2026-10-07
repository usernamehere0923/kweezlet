# kweezlet

A Quizlet-style flashcard app, built as a learning project: learning to build a real web app end to end, from database to phone home screen. Not a product, no sign-up; accounts are created by hand.

- UI: React + Tailwind, installable on the iPhone home screen
- API: Cloudflare Worker (Hono), D1 (SQLite), one Durable Object for live sync between devices
- Languages: English and Swiss German

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, login demo / demo
npm test           # worker + UI tests
npm run check      # types, lint, format
```

First-time setup: [SETUP.md](SETUP.md). Rules for working on the code: [AGENTS.md](AGENTS.md).
