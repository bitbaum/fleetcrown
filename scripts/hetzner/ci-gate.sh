#!/usr/bin/env bash
# CI gate for push-deploys — deploy only what CI has verified.
#
# WHY: the push-deploy hook used to fire deploy.sh IN PARALLEL with GitHub CI,
# so prod shipped before the CI verdict existed; the only gate was local
# pre-push hooks (bypassable with --no-verify, and different per repo). This
# waits for the pushed commit's own workflow runs and blocks the deploy on a red.
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

# WHAT COUNTS AS "CI". Only workflow runs defined in the repository —
# .github/workflows/*. Everything else that reports against a commit is noise
# for this purpose:
#
#   * Dependabot's updater runs report as workflow runs with event=dynamic and
#     path=dynamic/dependabot/dependabot-updates. A failed dependency-graph
#     update is not a statement about whether the code works, but it blocked
#     solon and reparaturbonus-zh from deploying commits whose `verify` was
#     green. (Filtering by app slug does NOT separate them — Dependabot runs
#     under github-actions too. The workflow PATH is the discriminator.)
#   * Third-party check apps (Snyk) can sit pending forever and deadlock a gate
#     that waits for every check on the commit.
#
# Hence: the workflow-runs API filtered to real repo workflows, not the
# check-runs API.
# Exclude the DEPLOY workflow itself — every run of it, not just the current
# one. A retry after a failed deploy lands on the SAME SHA as the failure, so
# counting past deploy runs makes the second attempt permanently unreachable:
# the gate reads its own earlier failure as "CI is red". solon hit exactly this.
EXCLUDE_PATH="${CI_GATE_EXCLUDE_PATH:-}"
_path_clause=""
[ -n "$EXCLUDE_PATH" ] && _path_clause="| select(.path != \"$EXCLUDE_PATH\")"
RUN_FILTER='[.workflow_runs[]
  | select(.path | startswith(".github/workflows/")) '"$_path_clause"']'


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
  counts=$(gh api "repos/$NWO/actions/runs?head_sha=$SHA&per_page=100" --paginate \
    --jq "$RUN_FILTER | \"\(length)|\([.[] | select(.status == \"completed\")] | length)|\([.[] | select(.conclusion | IN(\"failure\",\"timed_out\",\"action_required\"))] | length)|\([.[] | select(.conclusion == \"cancelled\")] | length)\"" \
    2>/dev/null) || { echo "[ci-gate] $NWO@$SHA: API unreachable — passing open (network, not verdict)"; exit 0; }

  IFS='|' read -r total completed hard_failed cancelled <<<"$counts"

  # A genuine red always blocks, tip or not.
  if [ "${hard_failed:-0}" -gt 0 ]; then
    echo "[ci-gate] $NWO@${SHA:0:8}: CI FAILED ($hard_failed failing workflow(s)) — deploy blocked"
    exit 1
  fi

  if [ "${total:-0}" -eq 0 ]; then
    [ "$elapsed" -ge "$GRACE_S" ] && { echo "[ci-gate] $NWO@${SHA:0:8}: no CI configured — passing"; exit 0; }
  elif [ "$completed" -eq "$total" ]; then
    if [ "${cancelled:-0}" -eq 0 ]; then
      echo "[ci-gate] $NWO@${SHA:0:8}: CI green ($total workflow(s)) — deploy may proceed"
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
