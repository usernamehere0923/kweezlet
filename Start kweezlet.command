#!/bin/zsh -l
# Double-click to start kweezlet. Leave the window open while you work; close it to stop.
# --force rebuilds Vite's cache every start, so a stuck page never survives a restart.
cd "$(dirname "$0")" || exit 1
npm run dev -- --force --open
