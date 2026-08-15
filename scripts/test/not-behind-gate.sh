#!/usr/bin/env bash
# Tests for the backwards-deploy gate (scripts/ci/check-not-behind.sh).
#
# The gate exists because check-deploy-ref.sh cannot catch this: it asks "are
# you on main?", and a commit from last week's main answers yes forever. On
# 2026-08-15 a deploy from a stale checkout overwrote a CI-verified production
# with a tree ~25 commits old, ten minutes after the pipeline had confirmed the
# right build was live.
#
# Builds throwaway repos in a temp dir; touches nothing real, hits no network.
# Run: npm run test:not-behind-gate

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/../ci/check-not-behind.sh"
TMP="$(mktemp -d)"
# An empty TMP would make the fixture path absolute-from-root and still satisfy
# a "$TMP"/* match, so the containment check below is only meaningful once this
# holds. Same reasoning as deploy-ref-gate.sh.
[ -n "$TMP" ] && [ -d "$TMP" ] || { echo "  ✗ mktemp -d produced no usable dir" >&2; exit 1; }
trap 'rm -rf "$TMP"' EXIT

PASSED=0
fail() { echo "  ✗ $1" >&2; exit 1; }
ok()   { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }

REPO="$TMP/repo"

# ── The fixture must not be able to reach the real repository ────────────────
#
# `git -C <dir>` does NOT confine git to <dir>. If <dir> is not itself a repo,
# git walks UP the directory tree until it finds one — and from a checkout, the
# one it finds is the real project. Every mutating command below then aims at
# it: `checkout --orphan`, `rm -rq --cached .`, `checkout --detach`.
#
# That is not hypothetical. On 2026-08-15 the sibling suite deploy-ref-gate.sh
# did exactly this from the husky pre-push hook: the fixture ran against the
# real checkout, renamed a feature branch to `main`, and its final
# `push -q origin main` sent the fixture's single-file tree to GitHub, replacing
# the whole codebase on the default branch.
#
# The check that was supposed to prevent it — `case "$REPO" in "$TMP"/*)` — is
# TAUTOLOGICAL: REPO is built as "$TMP/repo", so the pattern cannot fail. It
# reads like containment and enforces nothing. This suite had inherited the same
# non-check.
#
# Two real defences instead of one fake one:
#   1. GIT_CEILING_DIRECTORIES stops the upward search at $TMP, so a fallthrough
#      finds no repo at all rather than finding the wrong one. Kills the class.
#   2. An assertion on the actual toplevel, which is a fact about the fixture
#      rather than a fact about how its path was spelled.
export GIT_CEILING_DIRECTORIES="$TMP"

git init -q "$REPO"
[ "$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null)" = "$REPO" ] \
  || fail "fixture is not its own repo at '$REPO' — refusing to run mutating git commands"
git -C "$REPO" config user.email t@example.com
git -C "$REPO" config user.name t
# The fixture must not inherit the machine's global hooks: a commit here is a
# test fixture, not a change worth scanning, and a slow or failing global hook
# would make this suite fail for reasons that have nothing to do with the gate.
git -C "$REPO" config core.hooksPath /dev/null

commit() { # message -> echoes sha
  echo "$1" > "$REPO/file.txt"
  git -C "$REPO" add file.txt
  git -C "$REPO" commit -q -m "$1"
  git -C "$REPO" rev-parse HEAD
}

OLD="$(commit old)"
MID="$(commit mid)"
NEW="$(commit new)"

# A genuinely unrelated line of history — the "sideways" case.
git -C "$REPO" checkout -q --orphan other
git -C "$REPO" rm -rq --cached . 2>/dev/null || true
OTHER="$(commit other-root)"
git -C "$REPO" checkout -q --detach "$NEW"

run() { bash "$GATE" "$1" "$2" "$REPO" >/dev/null 2>&1; }

# ── the case that actually happened ────────────────────────────────────────
if run "$NEW" "$OLD"; then
  fail "shipping an OLDER commit over a newer live build was allowed — this is the bug"
fi
ok "refuses a deploy that would move production backwards"

# ── the normal case must stay fast ─────────────────────────────────────────
run "$OLD" "$NEW" || fail "a fast-forward deploy was refused"
ok "allows a fast-forward (live is an ancestor of what ships)"

run "$OLD" "$MID" || fail "fast-forward to an intermediate commit was refused"
ok "allows a fast-forward that does not go all the way to the tip"

run "$NEW" "$NEW" || fail "redeploying the live commit was refused"
ok "allows redeploying the exact commit already live"

# ── sideways is not a fast-forward ─────────────────────────────────────────
if run "$NEW" "$OTHER"; then
  fail "shipping an unrelated history over the live build was allowed"
fi
ok "refuses a sideways jump to unrelated history"

# ── the override must work, or the gate blocks real rollbacks ──────────────
ALLOW_ROLLBACK=1 run "$NEW" "$OLD" || fail "ALLOW_ROLLBACK=1 did not permit a deliberate rollback"
ok "ALLOW_ROLLBACK=1 permits a deliberate rollback"

# ── undecidable cases must never block repairing a broken box ──────────────
run "" "$NEW" || fail "a box with no build-ref was blocked from deploying"
ok "allows shipping when the box reports no build-ref (nothing to compare)"

run "0000000000000000000000000000000000000000" "$NEW" \
  || fail "an unknown live commit blocked the deploy"
ok "allows shipping when the live commit is unknown to this checkout"

run "$OLD" "" || fail "an unresolvable shipping sha blocked the deploy"
ok "allows shipping when the shipping commit cannot be resolved"

# ── the refusal has to be usable, not just correct ─────────────────────────
out="$(bash "$GATE" "$NEW" "$OLD" "$REPO" 2>&1)"
case "$out" in
  *BACKWARDS*) ;;
  *) fail "refusal message does not say what went wrong" ;;
esac
case "$out" in
  *ALLOW_ROLLBACK*) ;;
  *) fail "refusal message does not tell the operator how to override" ;;
esac
ok "refusal names the problem and the way out"

# ── the guard must not be able to KILL a deploy ────────────────────────────
# Shipped once and broke production deploys immediately. deploy-hetzner.sh runs
# under `set -euo pipefail`; reading the box's marker is a QUESTION, and if the
# file is absent `cat` exits 1, pipefail propagates it, and `set -e` kills the
# deploy — silently, because the guard that would have explained itself never
# ran. Two deploys died between "table ownership reconciled" and the snapshot
# with no message at all.
#
# Both halves are asserted: the real line must stay fail-safe, and the shape
# must actually survive a non-zero read.
DEPLOY_SH="$SCRIPT_DIR/../deploy-hetzner.sh"
marker_line="$(grep -n 'LIVE_REF_NOW=' "$DEPLOY_SH" | head -1)"
[ -n "$marker_line" ] || fail "could not find the LIVE_REF_NOW read in deploy-hetzner.sh"
case "$marker_line" in
  *'|| true'*) ;;
  *) fail "the marker read is not fail-safe (needs '|| true'): $marker_line" ;;
esac
ok "the box-marker read in deploy-hetzner.sh is guarded against a non-zero ssh"

survived="$(bash -c '
  set -euo pipefail
  unreachable() { return 255; }          # an ssh that cannot reach the box
  V="$(unreachable 2>/dev/null | tr -d "[:space:]" || true)"
  echo "survived:${V:-empty}"
' 2>/dev/null)" || survived=""
[ "$survived" = "survived:empty" ] \
  || fail "the guarded read still aborts under set -euo pipefail (got '${survived:-<killed>}')"
ok "a failed marker read yields an empty answer instead of aborting the script"

# And an empty marker must reach the "ship anyway" path, not the refusal.
run "" "$NEW" || fail "an empty marker (failed read) refused the deploy"
ok "an unreadable marker ships rather than blocking (fails OPEN, by design)"

echo ""
echo "$PASSED passed"
