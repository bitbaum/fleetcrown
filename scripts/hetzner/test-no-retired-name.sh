#!/usr/bin/env bash
#
# The retired pseudonym must not come back.
#
# The founder ships under ONE name. An earlier pseudonym was retired, and on
# 2026-09-08 it was still in thirteen places — including the live privacy,
# terms, license and support pages, the public footer, and the `owner` field in
# ecosystem config. It was also hardcoded as the commit author in new-site.sh,
# so every site the scaffold created would have carried the retired name in its
# FIRST COMMIT, in a public repository, permanently. That one was caught by a
# --dry-run minutes before a real scaffold ran.
#
# A name that has been replaced everywhere still comes back, because it lives in
# examples, defaults and templates that nobody greps. Hence a check rather than
# a one-time sweep.
#
# SCOPE, and why it is drawn here:
#
#   src/, scripts/   FORBIDDEN. This is shipped code and operational tooling —
#                    what renders to users and what writes commits.
#
#   docs/            ALLOWED. The handoff doc must NAME the retired pseudonym in
#                    order to forbid it. A gate that cannot tolerate its own
#                    rule being written down forces the rule to be deleted.
#
#   legal/           OUT OF SCOPE, deliberately. An IP assignment memo and a
#                    privacy policy naming a data controller are legal
#                    instruments executed under a name. Renaming a party on a
#                    signed document is not a find-and-replace; it is a decision
#                    for the person who signed it. This check does not touch
#                    them, and their contents are not evidence of a defect.

set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SELF="$(basename "$0")"

# The retired name, assembled rather than written, so this file does not itself
# become the thing it forbids. Without this, the check matches its own source —
# the failure mode where a repo-scanning gate indexes itself and can never pass.
RETIRED="Mao"' '"Nakamoto"

pass=0
fail=0
ok()  { pass=$((pass+1)); printf '  ✓ %s\n' "$1"; }
bad() { fail=$((fail+1)); printf '  ✗ %s\n' "$1"; }

echo "retired pseudonym must not appear in shipped code"

hits=$(grep -rl "$RETIRED" "$ROOT/src" "$ROOT/scripts" 2>/dev/null \
        | grep -v "/$SELF$" || true)

if [ -z "$hits" ]; then
  ok "src/ and scripts/ are free of the retired name"
else
  bad "the retired name is back in shipped code:"
  printf '%s\n' "$hits" | sed "s|$ROOT/|      |"
fi

# ── the check can still fail ─────────────────────────────────────────────────
# A grep whose pattern stopped matching passes exactly as quietly as a clean
# tree. Prove on a fixture that it still fires, and prove the self-exclusion is
# doing real work rather than hiding a genuine hit.
probe="$(mktemp -d)"
trap 'rm -rf "$probe"' EXIT
mkdir -p "$probe/src"
printf 'export const owner = "%s";\n' "$RETIRED" > "$probe/src/probe.ts"
if grep -rq "$RETIRED" "$probe/src" 2>/dev/null; then
  ok "the pattern still matches a file that contains the name"
else
  bad "the pattern no longer matches — this check is inert"
fi

# The assembly above is what keeps this file from matching itself. Assert that
# it works, because if someone "tidies" RETIRED into a single literal, this
# script lands in src/-adjacent scripts/ carrying the forbidden string and the
# check fails forever on itself — the repo-scanning gate that indexes its own
# source. The grep -v self-exclusion is a second belt; this is the braces.
if grep -q "$RETIRED" "$0" 2>/dev/null; then
  bad "this file contains the retired name literally — it will match itself"
else
  ok "the name is assembled, so this file cannot match itself"
fi

# And prove RETIRED actually assembled into the real name, not an empty string.
# An empty pattern makes grep match everything, which would fail loudly; a
# mistyped one makes it match nothing, which passes silently. Check the value.
if [ "${#RETIRED}" -eq 12 ] && [ "${RETIRED% *}" = "Mao" ]; then
  ok "the pattern assembled to the expected value"
else
  bad "the pattern did not assemble correctly (got: '$RETIRED')"
fi

echo
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ] || {
  echo
  echo "Replace it with the current name. If the hit is a doc explaining the rule,"
  echo "it belongs under docs/, not in src/ or scripts/."
  exit 1
}
