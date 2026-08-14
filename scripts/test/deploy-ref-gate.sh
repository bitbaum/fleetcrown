#!/usr/bin/env bash
# Tests for the off-main deploy gate (scripts/ci/check-deploy-ref.sh).
#
# The gate is the automation that ended a class: a hand-run deploy from a
# feature branch overwriting prod, publishing unreviewed code and rolling main
# back at the same time. It runs only at deploy time, which is exactly the kind
# of code that rots unnoticed — so it gets tests.
#
# Builds throwaway repos in a temp dir; touches nothing real, hits no network.
# Run: npm run test:deploy-ref-gate

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/../ci/check-deploy-ref.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASSED=0
fail() { echo "  ✗ $1" >&2; exit 1; }
ok()   { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }

# A bare "origin" plus a clone, so origin/main is a real remote-tracking ref.
# --no-tags/-q keep output clean; identity is set locally so a machine without
# global git config still runs the suite.
setup_repo() {
  local root="$1"
  rm -rf "$root"; mkdir -p "$root"
  git init -q --bare "$root/origin.git"
  git clone -q "$root/origin.git" "$root/work" 2>/dev/null
  git -C "$root/work" config user.email t@t.t
  git -C "$root/work" config user.name t
  # Throwaway fixtures must not run the machine's global hooks (a secret scanner
  # here just floods the suite's output with irrelevant PASS lines).
  git -C "$root/work" config core.hooksPath /dev/null
  echo one > "$root/work/f"
  git -C "$root/work" add -A
  git -C "$root/work" commit -qm "one"
  git -C "$root/work" branch -M main
  git -C "$root/work" push -q origin main
}

# ── 1. a commit that IS origin/main passes ───────────────────────────────────
setup_repo "$TMP/a"
if bash "$GATE" "$TMP/a/work" HEAD >/dev/null 2>&1; then
  ok "commit contained in origin/main is allowed"
else
  fail "gate refused a commit that IS origin/main"
fi

# ── 2. an ANCESTOR of origin/main passes (redeploying an older main) ─────────
setup_repo "$TMP/b"
OLD="$(git -C "$TMP/b/work" rev-parse HEAD)"
echo two > "$TMP/b/work/f"
git -C "$TMP/b/work" commit -qam "two"
git -C "$TMP/b/work" push -q origin main
if bash "$GATE" "$TMP/b/work" "$OLD" >/dev/null 2>&1; then
  ok "ancestor of origin/main is allowed"
else
  fail "gate refused an ancestor of origin/main"
fi

# ── 3. THE INCIDENT: an off-main feature branch is refused ───────────────────
setup_repo "$TMP/c"
git -C "$TMP/c/work" checkout -qb feature
echo feat > "$TMP/c/work/f"
git -C "$TMP/c/work" commit -qam "unreviewed work"
OUT="$(bash "$GATE" "$TMP/c/work" HEAD 2>&1)"; RC=$?
[ $RC -eq 0 ] && fail "gate ALLOWED an off-main branch — the exact production incident"
grep -q "REFUSED" <<<"$OUT" || fail "refusal message missing 'REFUSED': $OUT"
ok "off-main feature branch is refused (the production incident)"

# ── 4. the refusal states the ROLLBACK, not just the unreviewed commits ──────
# A deploy from a stale branch reverts main. If the message doesn't say so, the
# reader treats it as a lint warning and reaches for the override.
setup_repo "$TMP/d"
STALE="$(git -C "$TMP/d/work" rev-parse HEAD)"
echo merged > "$TMP/d/work/f"
git -C "$TMP/d/work" commit -qam "merged since branching"
git -C "$TMP/d/work" push -q origin main
git -C "$TMP/d/work" checkout -q -b stale "$STALE"
echo local > "$TMP/d/work/f"
git -C "$TMP/d/work" commit -qam "local only"
OUT="$(bash "$GATE" "$TMP/d/work" HEAD 2>&1)"; RC=$?
[ $RC -eq 0 ] && fail "gate allowed a stale branch that would roll main back"
grep -q "ROLLED BACK" <<<"$OUT" || fail "refusal does not warn about rollback: $OUT"
grep -q "1 commit(s) on main" <<<"$OUT" || fail "rollback count wrong: $OUT"
ok "refusal names the rollback and counts both sides"

# ── 5. the override works, and announces itself ──────────────────────────────
OUT="$(FLEETCROWN_DEPLOY_ALLOW_OFF_MAIN=1 bash "$GATE" "$TMP/d/work" HEAD 2>&1)"; RC=$?
[ $RC -ne 0 ] && fail "override did not permit the deploy"
grep -q "OVERRIDDEN" <<<"$OUT" || fail "override is silent — it must announce itself: $OUT"
ok "explicit override permits the deploy and says so"

# ── 6. no origin/main (shallow CI checkout) warns but does not block ─────────
# Hard-failing here would break the hosted pipeline this gate exists to protect.
rm -rf "$TMP/e"; mkdir -p "$TMP/e"
git init -q "$TMP/e"
git -C "$TMP/e" config user.email t@t.t
git -C "$TMP/e" config user.name t
git -C "$TMP/e" config core.hooksPath /dev/null
echo x > "$TMP/e/f"
git -C "$TMP/e" add -A
git -C "$TMP/e" commit -qm "solo"
OUT="$(bash "$GATE" "$TMP/e" HEAD 2>&1)"; RC=$?
[ $RC -ne 0 ] && fail "gate blocked a checkout with no origin/main — would break CI"
grep -q "skipped" <<<"$OUT" || fail "skip was silent: $OUT"
ok "checkout without origin/main warns, does not block"

# ── 7. an unresolvable ref is refused, not waved through ─────────────────────
if bash "$GATE" "$TMP/a/work" no-such-ref >/dev/null 2>&1; then
  fail "gate allowed a ref that does not resolve"
fi
ok "unresolvable ref is refused"

echo ""
echo "$PASSED passed"
