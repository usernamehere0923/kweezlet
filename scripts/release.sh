#!/usr/bin/env bash
# Deploys or migrates exactly what is on GitHub's master, whatever branch is
# checked out. The current branch's files and unsaved changes are not touched
# (only a checked-out master is fast-forwarded): the build runs in a throwaway
# worktree that is deleted afterwards.
#
#   bash scripts/release.sh deploy [wrangler deploy args]   (npm run deploy: migrates, then deploys)
#   bash scripts/release.sh migrate                         (npm run db:migrate:remote: migrations only)
# Both dump the live database to backups/ before any migration.
set -euo pipefail

action=${1:-}
[[ $action == deploy || $action == migrate ]] || { echo "usage: release.sh deploy|migrate" >&2; exit 2; }
shift
[[ $action == migrate && $# -gt 0 ]] && { echo "release.sh migrate takes no arguments" >&2; exit 2; }
# The d1 steps (dump, migrations) always use the default database: an env
# would get new code on an unmigrated database.
for arg in "$@"; do
  case $arg in
    -e | --env | -e=* | --env=*) echo "release.sh: --env is not supported" >&2; exit 2 ;;
  esac
done

repo=$(git rev-parse --show-toplevel)
cd "$repo"

# The rules below come from master's copy of this script, so a branch that
# edits it cannot ship itself.
if [[ -z ${RELEASE_FROM_MASTER:-} ]]; then
  git fetch --quiet origin master
  RELEASE_FROM_MASTER=1 exec bash -c "$(git show origin/master:scripts/release.sh)" release.sh "$action" "$@"
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

# Same lockfile: reuse the installed packages instead of a fresh install.
# Either way every wrangler call below runs master's wrangler version.
if cmp -s "$repo/package-lock.json" package-lock.json; then
  ln -s "$repo/node_modules" node_modules
else
  npm ci --no-audit --no-fund --loglevel=error
fi

# Applies pending migrations to the live database, a full dump first.
# stdin from /dev/null: wrangler skips its "continue?" prompt. Nothing
# pending: a no-op. A failed list, export or migration stops here (set -e).
migrate_live() {
  # Captured, not piped into grep -q: with pipefail an early grep exit would
  # SIGPIPE wrangler and read as "pending".
  local pending backup
  pending=$(npx wrangler d1 migrations list DB --remote </dev/null)
  [[ $pending == *"No migrations to apply"* ]] && return 0
  # Something will change the live data: a dump first, kept locally
  # (backups/, gitignored). Outlives D1 Time Travel's 7 days.
  mkdir -p "$repo/backups"
  backup="$repo/backups/$(date +%Y-%m-%d-%H%M%S).sql"
  echo "Dumping the live database (the app pauses until this is done)..."
  npx wrangler d1 export DB --remote --output "$backup" </dev/null
  echo "Backup of the live database: $backup"
  npx wrangler d1 migrations apply DB --remote </dev/null
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
    npx wrangler deploy "$@"
    ;;
esac
