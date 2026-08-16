#!/usr/bin/env bash
# Regression test for the stranded-work watch — runs anywhere, no box needed.
#
# Why this exists: the naive version of this check ("is the local branch ahead of
# its upstream?") fires on every stale clone. On the box, ~/dev/revampit sits 74
# ahead / 129 behind origin/main, and all 74 were squash-merged months ago. An
# alert that is wrong on day one gets muted by day two, so the false-positive
# guards below are the load-bearing part of this script — not the detection.
#
# Drives the REAL scripts/hetzner/agent-work-check.sh (no second copy to drift)
# against throwaway repos built to each shape.
#
# Usage: scripts/hetzner/test-agent-work-watch.sh
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CHECK="$HERE/agent-work-check.sh"
[ -f "$CHECK" ] || { echo "missing $CHECK"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DEV="$TMP/dev"; mkdir -p "$DEV"

# core.hooksPath=/dev/null is a safety requirement, not tidiness. A fixture that
# runs the operator's real global hooks is how a pre-push hook once overwrote a
# live GitHub main from a throwaway repo. These repos must touch nothing but
# themselves.
G() {
  git -c user.email=t@t -c user.name=t \
      -c init.defaultBranch=main -c commit.gpgsign=false \
      -c core.hooksPath=/dev/null "$@"
}

# A repo with an origin it can actually push to, so "on a remote" is real.
new_repo() {
  # Separate `local` statements on purpose: bash declares every name in a
  # single `local` before assigning any of them, so `remote=$TMP/../$name.git`
  # would read an unbound `name` under `set -u`.
  local name="$1"
  local remote="$TMP/remotes/$name.git"
  local work="$DEV/$name"
  mkdir -p "$remote" && G init --quiet --bare "$remote"
  G clone --quiet "$remote" "$work" 2>/dev/null
  echo seed > "$work/README.md"
  G -C "$work" add -A && G -C "$work" commit --quiet -m "seed"
  G -C "$work" push --quiet -u origin main 2>/dev/null
  printf '%s' "$work"
}

# 1. clean, fully pushed → silent
clean=$(new_repo clean)

# 2. uncommitted work → flagged (exists nowhere else)
dirty=$(new_repo dirty)
echo "work in progress" > "$dirty/NEW.md"

# 3. THE GUARD: local main ahead of origin/main — the squash-merge shape.
#    Must NOT be flagged, or every stale clone screams forever.
stale=$(new_repo stale)
for i in 1 2 3; do
  echo "$i" >> "$stale/README.md"
  G -C "$stale" commit --quiet -am "local-only commit $i"
done

# 4. recent branch, never pushed, holding commits → flagged
fresh=$(new_repo fresh)
G -C "$fresh" checkout --quiet -b feat/agent-work
echo new > "$fresh/agent.md"
G -C "$fresh" add -A && G -C "$fresh" commit --quiet -m "agent work nobody can see"

# 5. THE OTHER GUARD: same shape but old → abandoned merged branch, not fresh
#    agent work. Must NOT be flagged.
old=$(new_repo old)
G -C "$old" checkout --quiet -b feat/long-abandoned
echo old > "$old/old.md"
G -C "$old" add -A
GIT_COMMITTER_DATE="2020-01-01T00:00:00" GIT_AUTHOR_DATE="2020-01-01T00:00:00" \
  G -C "$old" commit --quiet -m "abandoned"

# 6. branch WITH an upstream, ahead of it → the remote has the branch; the
#    operator's business, not stranded. Must NOT be flagged.
tracked=$(new_repo tracked)
G -C "$tracked" checkout --quiet -b feat/tracked
echo a > "$tracked/a.md"
G -C "$tracked" add -A && G -C "$tracked" commit --quiet -m "pushed"
G -C "$tracked" push --quiet -u origin feat/tracked 2>/dev/null
echo b >> "$tracked/a.md"
G -C "$tracked" commit --quiet -am "ahead of upstream"

# 7. The pure stale-clone shape: default branch, NO upstream, holding commits
#    that are on no remote. Two guards overlap on case 3 (upstream + default
#    branch), so this isolates the default-branch one — without it, every
#    untracked local main on the box reports as stranded forever.
orphan=$(new_repo orphan)
G -C "$orphan" branch --unset-upstream main 2>/dev/null || true
echo drift >> "$orphan/README.md"
G -C "$orphan" commit --quiet -am "local-only on an untracked default branch"

out=$(DEV_ROOT="$DEV" MAX_AGE_D=7 bash "$CHECK" --report 2>&1)

fail=0
expect_flagged()   { grep -q "STRANDED agent work in $1 " <<<"$out" || { echo "FAIL: $1 should be flagged — $2"; fail=1; }; }
expect_silent()    { grep -q "STRANDED agent work in $1 " <<<"$out" && { echo "FAIL: $1 must NOT be flagged — $2"; fail=1; } || true; }

expect_silent  clean   "clean, fully pushed"
expect_flagged dirty   "uncommitted work exists nowhere else"
expect_silent  stale   "local main ahead of origin = squash-merged history, the revampit false positive"
expect_flagged fresh   "recent never-pushed branch is exactly stranded agent work"
expect_silent  old     "an old no-upstream branch is an abandoned merged branch"
expect_silent  tracked "a branch with an upstream is known to the remote"
expect_silent  orphan  "an untracked DEFAULT branch is a stale clone, not agent work"

# The dirty repo's message must name what is wrong, not just that something is.
grep -q "uncommitted" <<<"$out" || { echo "FAIL: message should say what is stranded"; fail=1; }
grep -q "2 repo(s) with stranded work, 7 scanned" <<<"$out" || {
  echo "FAIL: summary must report BOTH findings and how many repos were read — got: $(grep 'repo(s)' <<<"$out")"
  fail=1
}

# ── The failure this sweep actually shipped with ────────────────────────────
# Running as the wrong user, git refused every repo for dubious ownership, each
# was silently skipped, and the sweep printed a confident "0 stranded". A
# monitor that cannot go red is worse than no monitor, because it is believed.
# Two guards, both asserted here.

# 1. A directory that looks like a checkout but git will not open is REPORTED.
broken="$DEV/broken"; mkdir -p "$broken/.git"
echo "not a real git dir" > "$broken/.git/config"
bout=$(DEV_ROOT="$DEV" MAX_AGE_D=7 bash "$CHECK" --report 2>&1)
grep -q "UNREADABLE repo broken" <<<"$bout" || { echo "FAIL: an unopenable checkout must be reported, not skipped"; fail=1; }
rm -rf "$broken"

# 2. A root with no readable repos at all goes red rather than reporting clean.
empty="$TMP/empty"; mkdir -p "$empty"
eout=$(DEV_ROOT="$empty" MAX_AGE_D=7 bash "$CHECK" --report 2>&1)
grep -q "ZERO repos" <<<"$eout" || { echo "FAIL: a sweep that reads nothing must say so, not report a clean run"; fail=1; }
grep -q "0 repo(s) with stranded work, 0 scanned" <<<"$eout" || { echo "FAIL: empty sweep must still report its scanned count"; fail=1; }

# ── Alert path: only fires on a state FLIP, never every tick (the 2026-08-05
# disk-alert storm). Reuses the shipped lib-alert.sh contract.
MONDIR="$TMP/mon"; mkdir -p "$MONDIR/state"
cat > "$MONDIR/lib-alert.sh" <<'LIB'
alert() { echo "ALERT $1 $2" >> "$MON/sent.log"; }
alert_transition() {
  local key="$1" state="$2" emoji="$3" text="$4"
  local sf="$MON/state/host_$(printf '%s' "$key" | tr -c 'a-zA-Z0-9' '_')"
  local prev="ok"; [ -f "$sf" ] && prev=$(cat "$sf")
  [ "$state" = "$prev" ] && return 0
  printf '%s' "$state" > "$sf"
  if [ "$state" = "bad" ]; then alert "$emoji" "$text"; else alert "✅" "RECOVERED: $key"; fi
  return 0
}
LIB
for _ in 1 2 3; do MON="$MONDIR" DEV_ROOT="$DEV" MAX_AGE_D=7 bash "$CHECK" >/dev/null 2>&1; done
sent=$(grep -c "STRANDED" "$MONDIR/sent.log" 2>/dev/null || echo 0)
if [ "$sent" -ne 2 ]; then
  echo "FAIL: 3 ticks over 2 stranded repos should send 2 alerts, sent $sent (storm or silence)"
  fail=1
fi

# Clearing the problem sends exactly one recovery, and not on every later tick.
rm -f "$dirty/NEW.md"
MON="$MONDIR" DEV_ROOT="$DEV" MAX_AGE_D=7 bash "$CHECK" >/dev/null 2>&1
MON="$MONDIR" DEV_ROOT="$DEV" MAX_AGE_D=7 bash "$CHECK" >/dev/null 2>&1
rec=$(grep -c "RECOVERED: agentwork_dirty" "$MONDIR/sent.log" 2>/dev/null || echo 0)
[ "$rec" -eq 1 ] || { echo "FAIL: expected exactly 1 recovery for 'dirty', got $rec"; fail=1; }

[ "$fail" = 0 ] && echo "✓ agent-work-watch tests passed" || exit 1
