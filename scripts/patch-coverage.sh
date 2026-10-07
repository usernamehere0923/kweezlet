#!/usr/bin/env bash
# scripts/patch-coverage.sh [base-ref]
#
# Patch coverage: lines this branch adds or changes must be >= PATCH_MIN% covered.
# The floor in vitest.config.ts (coverage.thresholds) asks "is the codebase tested
# enough?"; this asks "is the code I just wrote tested?". A big well-tested
# codebase can absorb untested new code without the floor ever going red.
#
# Ported from ../rongo. Needs coverage/lcov.info (npm test -- --coverage) and
# diff-cover (pip install diff-cover==10.3.0).
set -euo pipefail

BASE_REF="${1:-origin/main}"
PATCH_MIN="${PATCH_MIN:-75}"
REPORT=coverage/lcov.info
OUT=coverage/patch.md
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# diff-cover needs the base commit; CI checkouts are shallow by default.
if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  echo "patch-coverage: base ref '$BASE_REF' not found. In CI, actions/checkout needs fetch-depth: 0." >&2
  exit 2
fi

# A gate that checked nothing must not pass.
if [[ ! -f "$REPORT" ]]; then
  echo "patch-coverage: $REPORT missing. Run: npm test -- --coverage" >&2
  exit 2
fi

base="$(git merge-base "$BASE_REF" HEAD)"

# Escape hatch for changes that add no logic (wholesale reformat, rename): put
# [skip patch-coverage] in a commit message on the branch. The floor still applies.
if git log --format='%B' "$base"..HEAD | grep -qF '[skip patch-coverage]'; then
  echo "::warning::patch-coverage SKIPPED: a commit on this branch carries [skip patch-coverage]."
  exit 0
fi

fail=0
diff-cover "$REPORT" --compare-branch "$BASE_REF" --fail-under "$PATCH_MIN" --format "markdown:$OUT" || fail=1
cat "$OUT" >> "${GITHUB_STEP_SUMMARY:-/dev/null}" 2>/dev/null || true

# diff-cover passes with "No lines with coverage information" when the report's
# paths don't match git's. Fine for a docs/tests-only diff; a bug when sources
# changed and none of them is in the report. Type-only files are never in it.
if grep -q 'No lines with coverage information' "$OUT"; then
  changed="$(git diff --name-only "$base"...HEAD -- 'src/*.ts' 'src/*.tsx' 'worker/*.ts' |
    grep -vE '(\.test\.tsx?|\.d\.ts|^src/test/.*)$' || true)"
  if [[ -n "$changed" ]] && ! grep -qF -f <(sed 's/^/SF:/' <<<"$changed") "$REPORT"; then
    if ! sed -n 's/^SF://p' "$REPORT" | head -1 | xargs test -e; then
      echo "patch-coverage: FAIL: sources changed but $REPORT paths do not match git's." >&2
      fail=1
    fi
  fi
fi

exit "$fail"
