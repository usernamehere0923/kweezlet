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

BASE_REF="${1:-origin/master}"
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
# [skip patch-coverage] in the commit message. Only when EVERY checked commit
# carries it, so one marked reformat cannot wave through logic next to it.
# The floor still applies. Each message is read whole into a variable: under
# pipefail, `git log | grep -q` can SIGPIPE git log and flip the result.
skip=0
for sha in $(git rev-list "$base"..HEAD); do
  msg="$(git log -1 --format=%B "$sha")"
  if [[ "$msg" == *"[skip patch-coverage]"* ]]; then skip=1; else skip=0 && break; fi
done
if [[ "$skip" -eq 1 ]]; then
  echo "::warning::patch-coverage SKIPPED: every commit carries [skip patch-coverage]."
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
    first="$(sed -n 's/^SF://p' "$REPORT" | head -n 1)"
    if [[ -z "$first" || ! -e "$first" ]]; then
      echo "patch-coverage: FAIL: sources changed but $REPORT is empty or its paths do not match git's." >&2
      fail=1
    fi
  fi
fi

exit "$fail"
