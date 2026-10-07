#!/bin/zsh -l
# Double-click to start kweezlet. Leave the window open while you work; close it to stop.
cd "$(dirname "$0")" || exit 1
# New files in migrations/ reach the local database before the app starts. Keeps all data.
# CI=true: wrangler would otherwise stop and ask "continue? (Y/n)" in this window.
CI=true npm run db:migrate || exit 1
# --force rebuilds Vite's cache every start, so a stuck page never survives a restart.
npm run dev -- --force --open
