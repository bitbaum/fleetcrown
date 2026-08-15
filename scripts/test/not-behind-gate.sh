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
# Three real defences instead of one fake one:
#   1. GIT_CEILING_DIRECTORIES stops the upward search at $TMP, so a fallthrough
#      finds no repo at all rather than finding the wrong one. Kills the class.
#   2. NOTHING is ever written with `git config`. That is the write which
#      escaped a single branch: the sibling fixture's
#      `config core.hooksPath /dev/null` landed in the SHARED
#      /home/g/dev/fleetcrown/.git/config, silently disabling husky for the main
#      checkout and every worktree — so for part of that day `--no-verify` was a
#      no-op because there was no hook left to skip. Identity and hook
#      suppression come from the environment and from per-command `-c`, neither
#      of which can persist into a config file the rest of the fleet reads.
#   3. Every git call goes through g(), which re-asserts that the directory it
#      is about to mutate really is the fixture. Checked per command, not once
#      at setup, because the property that matters is "this command writes
#      here", not "this path looked right earlier".
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=fixture GIT_AUTHOR_EMAIL=fixture@invalid
export GIT_COMMITTER_NAME=fixture GIT_COMMITTER_EMAIL=fixture@invalid

git init -q "$REPO"

# `-C` alone does not confine git; this does. Physical paths on both sides so a
# symlinked TMPDIR (/tmp -> /private/tmp and friends) is not a false mismatch.
g() {
  local top
  top="$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null)" || top=""
  [ -n "$top" ] && [ "$(cd "$top" 2>/dev/null && pwd -P)" = "$(cd "$REPO" 2>/dev/null && pwd -P)" ] \
    || fail "refusing '$*': '$REPO' is not its own repo (git would have written to '${top:-<walked up>}')"
  git -c core.hooksPath=/dev/null -C "$REPO" "$@"
}

commit() { # message -> echoes sha
  echo "$1" > "$REPO/file.txt"
  g add file.txt
  g commit -q -m "$1"
  g rev-parse HEAD
}

OLD="$(commit old)"
MID="$(commit mid)"
NEW="$(commit new)"

# A genuinely unrelated line of history — the "sideways" case.
g checkout -q --orphan other
g rm -rq --cached . 2>/dev/null || true
OTHER="$(commit other-root)"
g checkout -q --detach "$NEW"

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

# ── the isolation is itself under test ─────────────────────────────────────
# The previous guard was never exercised against the case it claimed to
# prevent, which is exactly why nobody noticed it could not fail.
#
# The shape has to match reality or the test is decorative too. A bare
# "$TMP/not-a-repo" proves nothing: $TMP is under /tmp, nothing above it is a
# repo, so git finds no repo whether or not any defence is in place — it passes
# for the wrong reason. (First version of this assert did exactly that.)
#
# The real-world shape is a fixture directory sitting INSIDE a repository —
# which is what a TMPDIR under a checkout gives you, and how the sibling suite
# came to mutate the real project. Build that, and the refusal is load-bearing.
# The enclosing repo needs a COMMIT, or the probe below succeeds for the wrong
# reason: `rev-parse HEAD` fails in an empty repo whether or not the escape
# happened, so an unguarded g() would look like a refusal. (Second version of
# this assert did exactly that.) With a commit, an escape returns a real sha and
# exit 0 — so the assert fires precisely when the isolation is gone.
git init -q "$TMP/enclosing"
echo enclosing > "$TMP/enclosing/marker.txt"
git -C "$TMP/enclosing" add marker.txt
git -C "$TMP/enclosing" commit -q -m "enclosing repo has history"
mkdir -p "$TMP/enclosing/inner"
( REPO="$TMP/enclosing/inner"; g rev-parse HEAD ) >/dev/null 2>&1 \
  && fail "g() accepted a non-repo dir nested in a repo — it would have mutated the ENCLOSING repo"
ok "g() refuses a non-repo directory nested inside another repo (would have hit the enclosing one)"

# And the fixture must never persist config, since that is the write that
# reached beyond a branch into the shared /home/g/dev/fleetcrown/.git/config.
# Anchored to COMMAND position: a line that merely mentions the words (this one
# does) is prose, while a line that starts with `git`/`g` and reaches `config`
# is the write that caused the damage.
grep -qE '^[[:space:]]*(git|g)[[:space:]].*\bconfig\b' "$0" \
  && fail "this suite writes git config — use env + per-command -c so nothing can persist"
ok "the fixture writes no git config (identity and hooks come from the environment)"

echo ""
echo "$PASSED passed"
