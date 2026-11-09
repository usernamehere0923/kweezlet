#!/usr/bin/env bash
# Deploys or migrates exactly what is on GitHub's master, whatever branch is
# checked out. The current branch's files and unsaved changes are not touched
# (only a checked-out master is fast-forwarded): the build runs in a throwaway
# worktree that is deleted afterwards.
#
#   bash scripts/release.sh deploy    (npm run deploy: migrates, then deploys)
#   bash scripts/release.sh migrate   (npm run db:migrate:remote: migrations only)
# Both dump the live database to backups/ before any migration.
set -euo pipefail

# No wrangler args, no CLOUDFLARE_ENV: the dump and the migrations always hit
# wrangler.jsonc's DB, so --env, --config or --dry-run would split the code
# from its migrated database (or migrate for a deploy that never happens).
action=${1:-}
if [[ $# -ne 1 || ($action != deploy && $action != migrate) ]]; then
  echo "usage: release.sh deploy|migrate (no further arguments)" >&2
  exit 2
fi
[[ -z ${CLOUDFLARE_ENV:-} ]] || { echo "release.sh: unset CLOUDFLARE_ENV first" >&2; exit 2; }

repo=$(git rev-parse --show-toplevel)
cd "$repo"

# The rules below come from master's copy of this script, so a branch that
# edits it cannot ship itself.
if [[ -z ${RELEASE_FROM_MASTER:-} ]]; then
  git fetch --quiet origin master
  RELEASE_FROM_MASTER=1 exec bash -c "$(git show origin/master:scripts/release.sh)" release.sh "$action"
fi

# Unmerged work never ships: local master must not be ahead of GitHub.
if git rev-parse --verify --quiet master >/dev/null && [[ -n $(git rev-list origin/master..master) ]]; then
  echo "Local master has commits that are not on GitHub. Merge them through a pull request first." >&2
  exit 1
fi

# Bring local master up to date. A convenience only: the release uses
# origin/master either way.
if [[ $(git branch --show-current) == master ]]; then
  git merge --ff-only --quiet origin/master ||
    echo "Note: local master not updated (git merge --ff-only failed). Releasing GitHub's master anyway."
else
  git fetch --quiet . origin/master:master 2>/dev/null ||
    echo "Note: local master not updated (checked out elsewhere?). Releasing GitHub's master anyway."
fi

# The live database must be configured on master, or the app would talk to none.
if git show origin/master:wrangler.jsonc | grep -v '^[[:space:]]*//' |
  grep -Eq '"database_id"[[:space:]]*:[[:space:]]*"0{8}-0{4}-0{4}-0{4}-0{12}"'; then
  echo "wrangler.jsonc on master still has the all-zeros database_id." >&2
  echo "Do the README 'Once' steps, then merge the real database_id into master." >&2
  exit 1
fi

dir=$(mktemp -d "${TMPDIR:-/tmp}/kweezlet-release.XXXXXX")
cleanup() {
  rm -rf "$dir"
  git -C "$repo" worktree prune
}
trap cleanup EXIT INT TERM
git worktree add --quiet --detach "$dir" origin/master
cd "$dir"
echo "Releasing master at $(git log -1 --format='%h %s')"

# Untracked local env overrides (e.g. PUBLIC_URL in .env.production.local).
for file in "$repo"/.env*.local; do
  [[ -e $file ]] && cp "$file" "$dir/"
done

# Same lockfile and installed: reuse the packages instead of a fresh install.
# Either way every wrangler call below runs master's wrangler version.
if [[ -d $repo/node_modules ]] && cmp -s "$repo/package-lock.json" package-lock.json; then
  ln -s "$repo/node_modules" node_modules
else
  npm ci --no-audit --no-fund --loglevel=error
fi
# The installed binary, never npx: with stdin not a terminal, npx would fetch
# an unpinned wrangler from npm when it is missing and run it on live data.
wrangler="$dir/node_modules/.bin/wrangler"

# Applies pending migrations to the live database, a full dump first.
# stdin from /dev/null: wrangler skips its "continue?" prompt. Nothing
# pending: a no-op. A failed list, export or migration stops here (set -e).
migrate_live() {
  # Captured, not piped into grep -q: with pipefail an early grep exit would
  # SIGPIPE wrangler and read as "pending".
  local pending backup
  pending=$("$wrangler" d1 migrations list DB --remote </dev/null)
  [[ $pending == *"No migrations to apply"* ]] && return 0
  # The very first migration pending: a new, empty database, nothing to keep.
  # Otherwise a dump first, kept locally (backups/, gitignored), outliving
  # D1 Time Travel's 7 days. Written as .incomplete.sql (keeps the .sql
  # ending) and renamed when complete, so a broken export never looks like a
  # backup.
  if [[ $pending != *0001_auth* ]]; then
    mkdir -p "$repo/backups"
    backup="$repo/backups/$(date +%Y-%m-%d-%H%M%S)"
    echo "Dumping the live database (the app pauses until this is done)..."
    "$wrangler" d1 export DB --remote --output "$backup.incomplete.sql" </dev/null
    mv "$backup.incomplete.sql" "$backup.sql"
    backup="$backup.sql"
    echo "Backup of the live database: $backup"
  fi
  "$wrangler" d1 migrations apply DB --remote </dev/null
}

case $action in
  migrate)
    migrate_live
    ;;
  deploy)
    npx vite build
    # Migrations first, from this same master: the new code may need them.
    # After the build (a failed build leaves the database alone), before the
    # upload. Additive, so the old code keeps running meanwhile.
    migrate_live
    "$wrangler" deploy
    ;;
esac
