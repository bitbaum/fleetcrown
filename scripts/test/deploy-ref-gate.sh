#!/usr/bin/env bash
# Tests for the off-main deploy gate (scripts/ci/check-deploy-ref.sh).
#
# The gate is the automation that ended a class: a hand-run deploy from a
# feature branch overwriting prod, publishing unreviewed code and rolling main
# back at the same time. It runs only at deploy time, which is exactly the kind
# of code that rots unnoticed — so it gets tests.
#
# ── THIS SUITE ONCE DESTROYED THE REPO IT RUNS IN ────────────────────────────
# 2026-08-15: it ran from the husky pre-push hook, its fixtures fell through to
# the REAL checkout, and because pre-push runs BEFORE the transfer, git then
# pushed what the fixture had just mangled. `refs/heads/main` on GitHub was left
# pointing at a fixture commit whose tree is a single file named `f`. It also
# wrote `core.hooksPath=/dev/null` into the SHARED .git/config, silently
# disabling every hook for every worktree.
#
# The mechanism was `git -C <dir>`: when <dir> is not a repo, git WALKS UP the
# directory tree and happily operates on whatever repo it finds — here, the real
# one. `setup_repo` then ran `git branch -M main` and `git push origin main` on
# it. A previous "fix" added `case "$root" in "$TMP"/*)`, which is tautological
# ($root is built as "$TMP/a") and enforced precisely nothing.
#
# The isolation below is therefore built so that NO single failure can reach a
# real repo:
#   1. GIT_CEILING_DIRECTORIES stops git's upward search at $TMP — the walk-up
#      that caused this cannot physically happen.
#   2. Every git call goes through `g`, which asserts the target really is the
#      fixture repo before running. No bare `git -C` anywhere below.
#   3. Pushes name an explicit PATH, never the remote `origin` — so even a
#      fallthrough has nowhere to publish.
#   4. Identity and hook suppression come from ENV, never `git config` — a
#      config write is what corrupted the shared config, and env cannot leak.
#   5. $TMP is refused if it sits inside a git repo at all.
#   6. The ambient git environment is unset (below) — see why.
#
# ── AND IT INHERITED A HANDLE TO THE REAL REPO ───────────────────────────────
# The husky pre-push hook exports GIT_DIR (for a worktree push, e.g.
# `.git/worktrees/<name>`). An explicit GIT_DIR is not a search path, so
# GIT_CEILING_DIRECTORIES does not constrain it — and `g` could not catch it
# either: with GIT_DIR set and no work tree, `git -C <fixture> rev-parse
# --show-toplevel` answers `<fixture>`, matching the assertion exactly while
# every object and ref operation lands in the REAL repo. Guard 5 was the only
# thing left standing, which is why pushing from a worktree failed with the
# confusing "temp dir is inside a git repo": with GIT_DIR set, an empty
# mktemp dir reads as a repo root.
#
# So the git environment is cleared before anything else runs. This is not a
# workaround for guard 5 — it removes the inherited handle that made guards 1-4
# unable to see the danger.
#
# Builds throwaway repos in a temp dir; touches nothing real, hits no network.
# Run: npm run test:deploy-ref-gate

set -uo pipefail

# Nothing below may inherit a pointer to a real repository. `git rev-parse
# --local-env-vars` is git's own list, so this cannot fall behind a new variable.
for _v in $(git rev-parse --local-env-vars 2>/dev/null); do unset "$_v"; done
unset GIT_PREFIX

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/../ci/check-deploy-ref.sh"

PASSED=0
fail() { echo "  ✗ $1" >&2; exit 1; }
ok()   { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }

TMP="$(mktemp -d)"
[ -n "$TMP" ] && [ -d "$TMP" ] || { echo "  ✗ mktemp -d produced no usable dir" >&2; exit 1; }
trap 'rm -rf "$TMP"' EXIT

# A temp dir INSIDE a repo would put every fixture within that repo's reach.
# Checked rather than assumed: TMPDIR is inherited, and some runners point it at
# the workspace.
if git -C "$TMP" rev-parse --show-toplevel >/dev/null 2>&1; then
  fail "refusing to run: temp dir '$TMP' is inside a git repo ($(git -C "$TMP" rev-parse --show-toplevel))"
fi

# The structural guarantee. Git will not search for a repository above $TMP, so
# a missing/broken fixture errors instead of silently retargeting a real repo.
export GIT_CEILING_DIRECTORIES="$TMP"
# Identity + hook suppression WITHOUT `git config` — nothing here can write to a
# real config file, and no global config is read.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=fixture GIT_AUTHOR_EMAIL=fixture@invalid
export GIT_COMMITTER_NAME=fixture GIT_COMMITTER_EMAIL=fixture@invalid

# Assert <dir> is its OWN repo at exactly that path, then run git there.
# Every git invocation in this file goes through this. `--show-toplevel` is
# compared against the physical path so a symlinked TMPDIR does not read as a
# mismatch — and a walk-up would resolve somewhere else entirely and be caught.
g() {
  local dir="$1"; shift
  local top want
  top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || fail "not a git repo: $dir"
  want="$(cd "$dir" 2>/dev/null && pwd -P)" || fail "fixture dir vanished: $dir"
  [ "$(cd "$top" && pwd -P)" = "$want" ] \
    || fail "REFUSING: git in '$dir' resolved to '$top' — a real repo, not the fixture"
  git -c core.hooksPath=/dev/null -C "$dir" "$@"
}

# A bare "origin" plus a clone, so origin/main is a real remote-tracking ref.
setup_repo() {
  local root="$1"
  rm -rf "$root"; mkdir -p "$root"
  git init -q --bare "$root/origin.git" || fail "could not create fixture remote at $root/origin.git"
  git clone -q "$root/origin.git" "$root/work" 2>/dev/null \
    || fail "fixture clone failed at $root/work"
  echo one > "$root/work/f"
  g "$root/work" add -A
  g "$root/work" commit -qm "one"
  g "$root/work" branch -M main
  # Explicit PATH, not the name `origin`: a fallthrough must have nowhere to go.
  g "$root/work" push -q "$root/origin.git" main
  # The clone's `origin` must point at the fixture bare repo for the gate to read
  # origin/main. Verified rather than trusted, since that is the exact property
  # whose absence published fixture commits to GitHub.
  local remote
  remote="$(g "$root/work" remote get-url origin 2>/dev/null)"
  [ "$remote" = "$root/origin.git" ] \
    || fail "fixture origin is '$remote', expected '$root/origin.git'"
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
OLD="$(g "$TMP/b/work" rev-parse HEAD)"
echo two > "$TMP/b/work/f"
g "$TMP/b/work" commit -qam "two"
g "$TMP/b/work" push -q "$TMP/b/origin.git" main
if bash "$GATE" "$TMP/b/work" "$OLD" >/dev/null 2>&1; then
  ok "ancestor of origin/main is allowed"
else
  fail "gate refused an ancestor of origin/main"
fi

# ── 3. THE INCIDENT: an off-main feature branch is refused ───────────────────
setup_repo "$TMP/c"
g "$TMP/c/work" checkout -qb feature
echo feat > "$TMP/c/work/f"
g "$TMP/c/work" commit -qam "unreviewed work"
OUT="$(bash "$GATE" "$TMP/c/work" HEAD 2>&1)"; RC=$?
[ $RC -eq 0 ] && fail "gate ALLOWED an off-main branch — the exact production incident"
grep -q "REFUSED" <<<"$OUT" || fail "refusal message missing 'REFUSED': $OUT"
ok "off-main feature branch is refused (the production incident)"

# ── 4. the refusal states the ROLLBACK, not just the unreviewed commits ──────
# A deploy from a stale branch reverts main. If the message doesn't say so, the
# reader treats it as a lint warning and reaches for the override.
setup_repo "$TMP/d"
STALE="$(g "$TMP/d/work" rev-parse HEAD)"
echo merged > "$TMP/d/work/f"
g "$TMP/d/work" commit -qam "merged since branching"
g "$TMP/d/work" push -q "$TMP/d/origin.git" main
g "$TMP/d/work" checkout -q -b stale "$STALE"
echo local > "$TMP/d/work/f"
g "$TMP/d/work" commit -qam "local only"
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
# This fixture has NO remote at all, which is why it must be its own repo: when
# it was not, the gate resolved the REAL origin/main and this test failed —
# the first visible symptom of the incident above.
rm -rf "$TMP/e"; mkdir -p "$TMP/e"
git init -q "$TMP/e" || fail "could not init fixture at $TMP/e"
echo x > "$TMP/e/f"
g "$TMP/e" add -A
g "$TMP/e" commit -qm "solo"
OUT="$(bash "$GATE" "$TMP/e" HEAD 2>&1)"; RC=$?
[ $RC -ne 0 ] && fail "gate blocked a checkout with no origin/main — would break CI"
grep -q "skipped" <<<"$OUT" || fail "skip was silent: $OUT"
ok "checkout without origin/main warns, does not block"

# ── 7. an unresolvable ref is refused, not waved through ─────────────────────
if bash "$GATE" "$TMP/a/work" no-such-ref >/dev/null 2>&1; then
  fail "gate allowed a ref that does not resolve"
fi
ok "unresolvable ref is refused"

# ── 8. the isolation itself holds ────────────────────────────────────────────
# `g` must REFUSE a directory that is not its own repo rather than letting git
# walk up — the failure that published fixture commits to GitHub.
#
# THE PROBE'S SHAPE IS THE WHOLE TEST, and the obvious shape proves nothing.
# Measured 2026-08-15, each with the assertion removed entirely:
#
#   bare "$TMP/not-a-repo"              → refused anyway. Nothing above $TMP is a
#                                         repo, so git finds nothing whether or
#                                         not any defence exists. PASSES WITH NO
#                                         GUARD AT ALL — decorative.
#   nested in a repo with NO commit     → refused anyway. `rev-parse HEAD` fails
#                                         in an empty repo too, so an escape is
#                                         indistinguishable from a refusal.
#   nested in a repo WITH a commit      → escapes, exit 0, returns the enclosing
#                                         repo's sha. Only this shape bites.
#
# That is the same mistake as the tautological `case` this file was written to
# remove, one level up: a guard is not a guard until it has been run against the
# thing it forbids and observed to FAIL.
ENCLOSING="$TMP/enclosing"
git init -q "$ENCLOSING" || fail "could not init the enclosing probe repo"
echo enclosing > "$ENCLOSING/f"
g "$ENCLOSING" add -A
g "$ENCLOSING" commit -qm "enclosing"
mkdir -p "$ENCLOSING/inner/not-a-repo"
# Subshell: the expected `fail` must not exit the suite.
if ( g "$ENCLOSING/inner/not-a-repo" rev-parse HEAD ) >/dev/null 2>&1; then
  fail "g() walked UP into '$ENCLOSING' instead of refusing — isolation is broken"
fi
ok "git calls refuse a target that is not the fixture repo (probe verified to bite)"

# ── 9. an inherited GIT_DIR (the hook environment) cannot retarget the suite ──
# Run the whole suite again with GIT_DIR pointing at a decoy repo, exactly as
# the pre-push hook sets it, and assert two things: the run still passes, and
# the decoy is byte-for-byte unchanged. Without the unset at the top of this
# file the decoy's HEAD moves — the fixtures commit into it.
if [ -z "${DEPLOY_REF_GATE_CHILD:-}" ]; then
  DECOY="$TMP/decoy"
  git init -q "$DECOY" || fail "could not init the decoy repo"
  echo decoy > "$DECOY/f"
  g "$DECOY" add -A
  g "$DECOY" commit -qm "decoy"
  BEFORE="$(g "$DECOY" rev-parse HEAD):$(g "$DECOY" for-each-ref --format='%(refname)%(objectname)' | sort | md5sum)"

  DEPLOY_REF_GATE_CHILD=1 GIT_DIR="$DECOY/.git" bash "${BASH_SOURCE[0]}" >/dev/null 2>&1 \
    || fail "suite fails when GIT_DIR is inherited — the hook environment breaks it"

  AFTER="$(g "$DECOY" rev-parse HEAD):$(g "$DECOY" for-each-ref --format='%(refname)%(objectname)' | sort | md5sum)"
  [ "$BEFORE" = "$AFTER" ] \
    || fail "fixtures WROTE to the repo named by an inherited GIT_DIR — isolation is broken"
  ok "an inherited GIT_DIR cannot retarget the fixtures (probe verified to bite)"
fi

echo ""
echo "$PASSED passed"
