#!/usr/bin/env bash
# CI gate for push-deploys — deploy only what CI has verified.
#
# WHY: the push-deploy hook used to fire deploy.sh IN PARALLEL with GitHub CI,
# so prod shipped before the CI verdict existed; the only gate was local
# pre-push hooks (bypassable with --no-verify, and different per repo). This
# waits for the pushed commit's check runs and blocks the deploy on a red.
#
# CANCELLED != FAILED. GitHub CI runs with `cancel-in-progress: true`, so a
# second push (a parallel session, a quick follow-up) CANCELS the earlier
# commit's CI run. The earlier code was fine — it was simply superseded. The old
# gate counted `cancelled` as a failure and printed "CI FAILED", blocking a
# deploy that never should have run anyway (the newer commit deploys instead).
# That false-negative cost real re-deploys. Now a cancelled run on a SUPERSEDED
# commit exits 3 (clean skip); only genuine failures block.
#
# Exit codes:
#   0  CI green (or no CI within grace)      → deploy may proceed
#   1  CI failed / still pending at timeout   → block (alarm; fix or re-push)
#   3  commit superseded (cancelled, and no   → skip quietly; the newer commit's
#      longer the branch tip)                    own gated deploy will ship
#
# Usage: ci-gate.sh <owner/repo> <sha>
set -euo pipefail

NWO="${1:?usage: ci-gate.sh <owner/repo> <sha>}"
SHA="${2:?}"
GRACE_S="${CI_GATE_GRACE_S:-90}"       # window for CI to register at all
TIMEOUT_S="${CI_GATE_TIMEOUT_S:-1500}" # 25 min ceiling for slow suites
POLL_S=20

# When the gate runs INSIDE a GitHub Actions deploy job, that job is itself a
# check run on this SHA — and it can never complete while it waits for itself.
# The caller passes its own check-suite id here so the gate ignores it. Empty
# (the laptop push-deploy hook) means "count every check run", as before.
EXCLUDE_SUITE="${CI_GATE_EXCLUDE_SUITE:-}"
if [ -n "$EXCLUDE_SUITE" ]; then
  SELF_FILTER="select(.check_suite.id != ${EXCLUDE_SUITE})"
else
  SELF_FILTER="."
fi

command -v gh >/dev/null 2>&1 || { echo "[ci-gate] gh not installed — passing open"; exit 0; }

# The branch tip decides whether a cancelled run means "superseded" (skip) or
# "the tip's own CI was cancelled" (rare; can't prove green → block). Resolved
# lazily and cached — only needed when a cancellation actually appears.
_TIP=""
resolve_tip() {
  [ -n "$_TIP" ] && { echo "$_TIP"; return; }
  local db
  db=$(gh api "repos/$NWO" --jq '.default_branch' 2>/dev/null) || db="main"
  _TIP=$(gh api "repos/$NWO/branches/$db" --jq '.commit.sha' 2>/dev/null) || _TIP=""
  echo "$_TIP"
}

start=$(date +%s)
while :; do
  now=$(date +%s); elapsed=$((now - start))

  # total|completed|hard_failed|cancelled
  #   hard_failed = conclusions that ALWAYS block (a real red)
  #   cancelled   = superseded runs, judged separately below
  counts=$(gh api "repos/$NWO/commits/$SHA/check-runs" --paginate \
    --jq "[.check_runs[] | $SELF_FILTER] | \"\(length)|\([.[] | select(.status == \"completed\")] | length)|\([.[] | select(.conclusion | IN(\"failure\",\"timed_out\",\"action_required\"))] | length)|\([.[] | select(.conclusion == \"cancelled\")] | length)\"" \
    2>/dev/null) || { echo "[ci-gate] $NWO@$SHA: API unreachable — passing open (network, not verdict)"; exit 0; }

  IFS='|' read -r total completed hard_failed cancelled <<<"$counts"

  # A genuine red always blocks, tip or not.
  if [ "${hard_failed:-0}" -gt 0 ]; then
    echo "[ci-gate] $NWO@${SHA:0:8}: CI FAILED ($hard_failed failing check(s)) — deploy blocked"
    exit 1
  fi

  if [ "${total:-0}" -eq 0 ]; then
    [ "$elapsed" -ge "$GRACE_S" ] && { echo "[ci-gate] $NWO@${SHA:0:8}: no CI configured — passing"; exit 0; }
  elif [ "$completed" -eq "$total" ]; then
    if [ "${cancelled:-0}" -eq 0 ]; then
      echo "[ci-gate] $NWO@${SHA:0:8}: CI green ($total check(s)) — deploy may proceed"
      exit 0
    fi
    # Runs completed but some were cancelled. Cancellation only happens when a
    # NEWER push superseded this commit — so if this SHA is no longer the tip,
    # bow out cleanly (the newer commit carries its own gated deploy).
    tip=$(resolve_tip)
    if [ -n "$tip" ] && [ "$tip" != "$SHA" ]; then
      echo "[ci-gate] $NWO@${SHA:0:8}: superseded by ${tip:0:8} — skipping (newer commit will deploy)"
      exit 3
    fi
    # Still the tip but its CI was cancelled with nothing newer to blame (rare
    # race). We can't prove green; block with an actionable message rather than
    # ship unverified code.
    echo "[ci-gate] $NWO@${SHA:0:8}: tip CI was cancelled unexpectedly — re-push to re-run, or deploy manually"
    exit 1
  fi

  if [ "$elapsed" -ge "$TIMEOUT_S" ]; then
    echo "[ci-gate] $NWO@${SHA:0:8}: CI still pending after ${TIMEOUT_S}s — deploy blocked (deploy manually once green)"
    exit 1
  fi
  sleep "$POLL_S"
done
