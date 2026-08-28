#!/usr/bin/env bash
# Tests for the deploy-readiness gate (scripts/ci/check-deploy-ready.sh).
#
# THE BUG THIS LOCKS SHUT
#
# The gate inspected the sibling checkouts under DEV_ROOT and nothing else. On
# the workstation all 15 are cloned, so it printed "all 15 deployed apps have
# CI". In CI only this repo is cloned, so the same commit printed fifteen
# missing repos and exited 1 — a red gate on a diff that touched none of them.
#
# That is the recurring failure mode across this fleet: a gate that judges state
# outside the commit. It is not a flake, it is a category error, and its cost is
# that everyone learns the gate is noise and starts passing --no-verify.
#
# So the split is asserted, both directions:
#   - what is IN the commit (apps.conf) must fail everywhere, CI included;
#   - what needs the fleet must be ANNOUNCED as not run, never silently passed
#     and never failed, when the fleet is absent.
#
# Builds fixtures in a temp dir by copying scripts/ and rewriting apps.conf.
# Touches nothing real, hits no network. Run: npm run test:deploy-ready-gate

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_SRC="$SCRIPT_DIR/.."
REAL_CONF="$SCRIPTS_SRC/hetzner/apps.conf"
TMP="$(mktemp -d)"
[ -n "$TMP" ] && [ -d "$TMP" ] || { echo "  ✗ mktemp -d produced no usable dir" >&2; exit 1; }
trap 'rm -rf "$TMP"' EXIT

PASSED=0
fail() { echo "  ✗ $1" >&2; exit 1; }
ok()   { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }

# Each case gets a pristine copy. `cp -r a b` nests when b exists, which silently
# made one of these fixtures re-run the previous one's manifest while reporting
# a pass — so the destination is removed first, every time.
fixture() {
  rm -rf "$TMP/scripts"
  cp -r "$SCRIPTS_SRC" "$TMP/scripts"
  echo "$TMP/scripts/ci/check-deploy-ready.sh"
}
# Strip the fleet out of a fixture's register: every checkout path becomes one
# that cannot exist. This is what CI actually looks like.
no_checkouts() { sed -i 's#|/home/g/dev/#|/nonexistent/dev/#g' "$TMP/scripts/hetzner/apps.conf"; }

# A fake checkout with exactly the workflow files given, nothing else — lets
# CI/CD detection be tested directly instead of trusting that the real fleet
# happens to be fully provisioned right now.
fake_repo() {
  local dir="$1"; shift
  mkdir -p "$dir/.github/workflows"
  for wf in "$@"; do
    case "$wf" in
      ci)     printf 'name: CI\non: push\njobs:\n  check:\n    steps:\n      - run: npm run verify\n' > "$dir/.github/workflows/ci.yml" ;;
      deploy) printf 'name: Deploy\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    uses: bitbaum/fleetcrown/.github/workflows/selfhost-deploy.yml@main\n' > "$dir/.github/workflows/deploy.yml" ;;
    esac
  done
}

echo
echo "the register half runs everywhere — it is in the diff"

G=$(fixture)
awk -F'|' 'BEGIN{OFS="|"} !/^#/ && NF==12 && ++n==2 {$2=4022} {print}' "$REAL_CONF" \
  > "$TMP/scripts/hetzner/apps.conf"
OUT=$("$G" 2>&1); RC=$?
[ "$RC" = 1 ] || fail "a duplicate port must fail (rc=$RC)"
echo "$OUT" | grep -q "already taken" || fail "a duplicate port must say so: $OUT"
ok "a duplicate port fails"

# The one that matters: malformed register AND no fleet. CI sees exactly this.
no_checkouts
OUT=$("$G" 2>&1); RC=$?
[ "$RC" = 1 ] || fail "a duplicate port must fail in CI too, where no checkout exists (rc=$RC)"
ok "a duplicate port still fails when no checkout exists — CI judges the diff"

G=$(fixture)
awk -F'|' 'BEGIN{OFS="|"} !/^#/ && NF==12 && ++n==1 {NF=11} {print}' "$REAL_CONF" \
  > "$TMP/scripts/hetzner/apps.conf"
OUT=$("$G" 2>&1); RC=$?
[ "$RC" = 1 ] || fail "a short row must fail (rc=$RC)"
echo "$OUT" | grep -q "fields, expected" || fail "a short row must name the field count: $OUT"
ok "a row with the wrong field count fails"

G=$(fixture)
awk -F'|' 'BEGIN{OFS="|"} !/^#/ && NF==12 && ++n==2 {$1="substrata"} {print}' "$REAL_CONF" \
  > "$TMP/scripts/hetzner/apps.conf"
OUT=$("$G" 2>&1); RC=$?
[ "$RC" = 1 ] || fail "a duplicate name must fail (rc=$RC)"
ok "a duplicate app name fails"

echo
echo "the fleet half is announced, never guessed"

G=$(fixture); no_checkouts
OUT=$("$G" 2>&1); RC=$?
[ "$RC" = 0 ] || fail "a bare environment must not fail a good register (rc=$RC): $OUT"
ok "no checkouts on a valid register exits 0 — the CI red this file exists to kill"

echo "$OUT" | grep -q "NOT RUN" \
  || fail "a skipped fleet inspection must SAY so — silence reads as all-clear: $OUT"
ok "the skip is announced, not silent"

echo "$OUT" | grep -q "register:" \
  || fail "the register half must still run when the fleet is absent: $OUT"
ok "the register is still checked when the fleet is absent"

echo "$OUT" | grep -q "all 15 deployed apps have it" \
  && fail "a bare environment must never claim the fleet is verified: $OUT"
ok "a bare environment never claims the fleet passed"

echo
echo "CI and CD are detected independently — camille had one and not the other"

G=$(fixture)
fake_repo "$TMP/app-ci-only" ci
fake_repo "$TMP/app-cd-only" deploy
fake_repo "$TMP/app-both" ci deploy
{
  echo "app-ci-only|5001|a.example.com|$TMP/app-ci-only|.|-|t|demo|demo|-|-|-"
  echo "app-cd-only|5002|b.example.com|$TMP/app-cd-only|.|-|t|demo|demo|-|-|-"
  echo "app-both|5003|c.example.com|$TMP/app-both|.|-|t|demo|demo|-|-|-"
} > "$TMP/scripts/hetzner/apps.conf"
echo 0 > "$TMP/scripts/ci/deploy-ready.baseline"
echo 0 > "$TMP/scripts/ci/deploy-ready-cd.baseline"
OUT=$("$G" 2>&1); RC=$?
[ "$RC" = 1 ] || fail "an app missing CI or CD must fail the gate (rc=$RC): $OUT"
ok "an app missing CI or CD fails the gate"

echo "$OUT" | grep -q "app-cd-only — deploys unverified" \
  || fail "the CI-missing app must be named under CI, not CD: $OUT"
ok "the app with only a Deploy workflow is flagged for missing CI"

echo "$OUT" | grep -q "app-ci-only — a green push here has never once reached the box" \
  || fail "the CD-missing app must be named under CD, not CI: $OUT"
ok "the app with only a CI workflow is flagged for missing CD (camille's exact shape)"

echo "$OUT" | grep -qE "app-both.*(unverified|never once reached)" \
  && fail "the fully-provisioned app must not be flagged on either dimension: $OUT"
ok "an app with both CI and CD is flagged on neither"

echo
echo "drift is distinguished from a bare environment"

G=$(fixture)
sed -i 's#|/home/g/dev/petvity|#|/home/g/dev/petvity-TYPO|#' "$TMP/scripts/hetzner/apps.conf"
if [ -d /home/g/dev/petvity ]; then
  OUT=$("$G" 2>&1); RC=$?
  [ "$RC" = 1 ] || fail "one bad path among present checkouts is drift and must fail (rc=$RC)"
  echo "$OUT" | grep -q "drift, not a bare" || fail "drift must be named as drift: $OUT"
  ok "one bad path among present checkouts fails as drift"
else
  ok "drift case not exercised — the fleet is not checked out here (reported, not skipped silently)"
fi

echo
echo "OK: $PASSED passed"
