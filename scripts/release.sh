#!/bin/zsh
# Deploys or migrates exactly what is on GitHub's master, whatever branch is
# checked out. The current branch and its unsaved changes are never touched:
# the build runs in a throwaway worktree that is deleted afterwards.
#
#   zsh scripts/release.sh deploy [--dry-run]   (npm run deploy)
#   zsh scripts/release.sh migrate              (npm run db:migrate:remote)
set -euo pipefail

action=${1:-}
[[ $action == deploy || $action == migrate ]] || { echo "usage: release.sh deploy|migrate" >&2; exit 2; }
shift

repo=$(git rev-parse --show-toplevel)
cd "$repo"
git fetch --quiet origin master

# Unmerged work never ships: local master must not be ahead of GitHub.
if git rev-parse --verify --quiet master >/dev/null && [[ -n $(git rev-list origin/master..master) ]]; then
  echo "Local master has commits that are not on GitHub. Merge them through a pull request first." >&2
  exit 1
fi

# Bring local master up to date without switching branches.
if [[ $(git branch --show-current) == master ]]; then
  git merge --ff-only --quiet origin/master ||
    echo "Note: local master not updated (unsaved changes in the way). Releasing GitHub's master anyway."
else
  git fetch --quiet . origin/master:master
fi

# The live database must be configured on master, or the app would talk to none.
if git show origin/master:wrangler.jsonc | grep -q '"database_id": "00000000-0000-0000-0000-000000000000"'; then
  echo "wrangler.jsonc on master still has the all-zeros database_id." >&2
  echo "Do the README 'Once' steps, then merge the real database_id into master." >&2
  exit 1
fi

dir=$(mktemp -d "${TMPDIR:-/tmp}/kweezlet-release.XXXXXX")
cleanup() { git -C "$repo" worktree remove --force "$dir" 2>/dev/null || true; }
trap cleanup EXIT
git worktree add --quiet --detach "$dir" origin/master
cd "$dir"
echo "Releasing master at $(git log -1 --format='%h %s')"
npm ci --no-audit --no-fund --loglevel=error

case $action in
  deploy) npx vite build && npx wrangler deploy "$@" ;;
  migrate) npx wrangler d1 migrations apply DB --remote ;;
esac
