#!/usr/bin/env bash
# Deploys or migrates exactly what is on GitHub's master, whatever branch is
# checked out. The current branch's files and unsaved changes are not touched
# (only a checked-out master is fast-forwarded): the build runs in a throwaway
# worktree that is deleted afterwards.
#
#   bash scripts/release.sh deploy [wrangler args]    (npm run deploy)
#   bash scripts/release.sh migrate [wrangler args]   (npm run db:migrate:remote)
set -euo pipefail

action=${1:-}
[[ $action == deploy || $action == migrate ]] || { echo "usage: release.sh deploy|migrate" >&2; exit 2; }
shift

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

wrangler="$repo/node_modules/.bin/wrangler"
case $action in
  migrate)
    # Only wrangler is needed: no install.
    "$wrangler" d1 migrations apply DB --remote "$@"
    ;;
  deploy)
    # Same lockfile: reuse the installed packages instead of a fresh install.
    if cmp -s "$repo/package-lock.json" package-lock.json; then
      ln -s "$repo/node_modules" node_modules
    else
      npm ci --no-audit --no-fund --loglevel=error
    fi
    npx vite build
    npx wrangler deploy "$@"
    ;;
esac
