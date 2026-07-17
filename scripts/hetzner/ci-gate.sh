#!/usr/bin/env bash
# CI gate for push-deploys — deploy only what CI has verified.
#
# WHY: the push-deploy hook used to fire deploy.sh IN PARALLEL with GitHub CI,
# so prod shipped before the CI verdict existed; the only gate was local
# pre-push hooks (bypassable with --no-verify, and different per repo). This
# waits for the pushed commit's check runs and blocks the deploy on a red.
#
# Semantics:
#   - no check runs appear within GRACE (repo has no CI)        → PASS
#   - every completed run success/neutral/skipped               → PASS
#   - any run failure/cancelled/timed_out/action_required       → FAIL
#   - still pending after TIMEOUT                               → FAIL (deploy
#     nothing you can't prove; re-push or deploy manually after green)
#
# Usage: ci-gate.sh <owner/repo> <sha>       (exit 0 = deploy may proceed)
set -euo pipefail

NWO="${1:?usage: ci-gate.sh <owner/repo> <sha>}"
SHA="${2:?}"
GRACE_S="${CI_GATE_GRACE_S:-90}"      # window for CI to register at all
TIMEOUT_S="${CI_GATE_TIMEOUT_S:-1500}" # 25 min ceiling for slow suites
POLL_S=20

command -v gh >/dev/null 2>&1 || { echo "[ci-gate] gh not installed — passing open"; exit 0; }

start=$(date +%s)
while :; do
  now=$(date +%s); elapsed=$((now - start))

  # total|completed|failed  (failed = any conclusion that must block a deploy)
  counts=$(gh api "repos/$NWO/commits/$SHA/check-runs" --paginate \
    --jq '[.check_runs[]] | "\(length)|\([.[] | select(.status == "completed")] | length)|\([.[] | select(.conclusion != null and (.conclusion | IN("failure","cancelled","timed_out","action_required")))] | length)"' \
    2>/dev/null) || { echo "[ci-gate] $NWO@$SHA: API unreachable — passing open (network, not verdict)"; exit 0; }

  IFS='|' read -r total completed failed <<<"$counts"

  if [ "${failed:-0}" -gt 0 ]; then
    echo "[ci-gate] $NWO@${SHA:0:8}: CI FAILED ($failed failing check(s)) — deploy blocked"
    exit 1
  fi
  if [ "${total:-0}" -eq 0 ]; then
    [ "$elapsed" -ge "$GRACE_S" ] && { echo "[ci-gate] $NWO@${SHA:0:8}: no CI configured — passing"; exit 0; }
  elif [ "$completed" -eq "$total" ]; then
    echo "[ci-gate] $NWO@${SHA:0:8}: CI green ($total check(s)) — deploy may proceed"
    exit 0
  fi
  if [ "$elapsed" -ge "$TIMEOUT_S" ]; then
    echo "[ci-gate] $NWO@${SHA:0:8}: CI still pending after ${TIMEOUT_S}s — deploy blocked (deploy manually once green)"
    exit 1
  fi
  sleep "$POLL_S"
done
