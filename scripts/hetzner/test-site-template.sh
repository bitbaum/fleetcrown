#!/usr/bin/env bash
#
# The scaffold's CI floor must not drift.
#
# `scripts/site-template/.github/workflows/ci.yml` is the THIRD copy of the
# golden CI floor. The other two live in fleet/templates/ci/ (ci-npm.yml and
# ci-pnpm.yml). On 2026-09-07 a fleet sweep found 14 of 32 repos rebuilding Next
# from scratch on every CI run and fixed both fleet templates — and missed this
# one, which is the copy the scaffold actually uses. Every site created in
# between started cold by construction.
#
# fleet's cicd-hygiene-audit.sh ratchets the same property, but it scans repos
# that already EXIST. A template defect is upstream of that: it ships the flaw
# into each new repo, and the ratchet then reports it once per repo, forever.
# This test is the upstream half.
#
# It asserts PROPERTIES the floor requires, not the file's exact text, so
# ordinary edits stay free and only a missing floor element fails.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CI="$HERE/../site-template/.github/workflows/ci.yml"

pass=0
fail=0
ok()  { pass=$((pass+1)); printf '  ✓ %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  ✗ %s\n' "$1"; }

echo "site-template CI floor"

if [ ! -f "$CI" ]; then
  echo "  ✗ scaffold has no ci.yml at all — every new site would deploy unverified"
  exit 1
fi
ok "the scaffold ships a ci.yml"

# Read once. Comments are NOT stripped: this file's comments deliberately name
# the very things it checks for, and a comment-blind scan would pass on a file
# whose only mention of `.next/cache` is prose explaining its absence. So each
# check below looks for the ACTIVE construct, not the bare word.
src="$(cat "$CI")"

want() { # want <description> <grep-E pattern>
  if printf '%s\n' "$src" | grep -qE "$2"; then ok "$1"; else bad "$1"; fi
}

want "restores .next/cache (a build job without it recompiles from scratch)" \
     '^[[:space:]]*path:[[:space:]]*\.next/cache'
want "uses actions/cache for that restore" \
     'uses:[[:space:]]*actions/cache@'
want "keys the cache on the lockfile so a dependency change invalidates it" \
     'hashFiles\(.*lock'
want "installs from the lockfile (pnpm install --frozen-lockfile)" \
     '^[[:space:]]*-[[:space:]]*run:[[:space:]]*pnpm install --frozen-lockfile[[:space:]]*$'
want "type-checks" '(run:.*type-check)'
want "lints"       '(run:.*pnpm run lint)'
want "builds"      '(run:.*pnpm run build)'
want "runs on pull_request, not only on push" '^[[:space:]]*pull_request:'
want "declares a concurrency group" '^concurrency:'

# ── the test can still fail ───────────────────────────────────────────────────
# A checker whose patterns stopped matching passes exactly as quietly as a
# correct template. Prove on a fixture that the cache assertion still fires.
probe="$(printf 'jobs:\n  verify:\n    steps:\n      - run: npm ci\n')"
if printf '%s\n' "$probe" | grep -qE '^[[:space:]]*path:[[:space:]]*\.next/cache'; then
  bad "the cache check matched a template that has NO cache — it is inert"
else
  ok "the cache check rejects a template without a cache"
fi

echo
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ] || {
  echo
  echo "The scaffold emits this file into every new site. A gap here is not one"
  echo "broken repo — it is every repo created from now on, and the fleet ratchet"
  echo "will report it once per repo rather than once."
  exit 1
}
