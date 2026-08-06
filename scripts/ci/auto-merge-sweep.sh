#!/usr/bin/env bash
#
# Merge every open PR that is ready and fully green, then re-arm CI on main.
#
# WHY THIS EXISTS
# ---------------
# Nobody reviews PRs on this repo — the owner explicitly does not want to be in
# the merge loop, and agent sessions running as background jobs are barred from
# merging by hand. So the policy lives here, in the repo, where it is visible,
# revocable, and applies uniformly to every PR instead of depending on who
# opened it.
#
# THE POLICY
#   merge a PR  <=>  it is not a draft
#                    AND carries no hold label
#                    AND has at least one check
#                    AND every check has finished green
#                    AND GitHub reports it cleanly mergeable
#
# Anything else is left alone for the next sweep. Nothing here forces a merge:
# a red or pending PR simply waits, and a draft waits forever. To hold a ready
# PR back, mark it a draft or add one of the hold labels below.
#
# ONE PR PER SWEEP, OLDEST FIRST, AND ONLY ONTO A GREEN MAIN
# ----------------------------------------------------------
# A PR's checks prove *that PR against the main it branched from* — not against
# the other PRs sitting next to it. Merging a batch in one pass would put a
# combination onto main that nothing ever built. So this script merges at most
# one PR, then hands control back to CI: the merge train advances one car per
# sweep, and every car is verified on main before the next one couples.
#
# Cars couple in the order they arrived. See the sort in the loop below — a
# newest-first train starves its oldest car when PRs keep arriving.
#
# For the same reason it refuses to merge while main's CI is red or still
# running. Red main => stop adding changes until it is fixed; running CI => the
# answer is not in yet. Both simply defer to the next sweep.
#
# HOW THE MERGE ACTUALLY REACHES THE BOX (do not remove)
#   A push made with the default GITHUB_TOKEN does NOT trigger workflows, so a
#   merge from this script lands on main without starting CI. Dispatching CI at
#   the end fixes the *verification* half — but not the deploy half: GitHub does
#   not emit a `workflow_run` event for a run that GITHUB_TOKEN started either,
#   so Deploy never chains off it. Observed 2026-08-05: three PRs auto-merged,
#   main green, and none of them deployed — the re-arm dispatch looked like it
#   was working because CI itself did run.
#
#   So deployment is a RECONCILER, not a chain (see "Reconcile" below): every
#   sweep compares main's tip against the last successful Deploy and dispatches
#   deploy.yml directly when they differ. Self-healing by construction — a
#   missed or failed deploy is retried on the next sweep rather than leaving a
#   commit merged-but-not-live. Silent no-deploy is the failure mode all of this
#   guards against, and it is the sharpest edge in the whole setup.

set -euo pipefail

REPO="${GH_REPO:-maonakamoto/fleetcrown}"
BASE_BRANCH="${BASE_BRANCH:-main}"

# A PR wearing any of these is never merged automatically.
HOLD_LABELS='["hold","no-automerge","do-not-merge","wip"]'

echo "[auto-merge] sweeping open PRs against ${BASE_BRANCH} in ${REPO}"

# Never add changes to a base that is red or mid-verification.
#
# The run has to belong to the CURRENT tip of the base branch. Checking only
# "the latest CI run" is a trap: right after a merge, the newest run is still
# the *previous* commit's — and it is green — so the guard would wave through a
# second merge onto a commit nothing has verified yet. That is exactly the
# batching this script exists to prevent.
main_sha=$(gh api "repos/${REPO}/commits/${BASE_BRANCH}" --jq '.sha')
main_ci=$(gh run list --repo "$REPO" --workflow ci.yml --branch "$BASE_BRANCH" --limit 1 \
  --json status,conclusion,headSha --jq '.[0] // empty')

if [ -z "$main_ci" ]; then
  echo "[auto-merge] no CI history for ${BASE_BRANCH} — proceeding"
else
  main_status=$(printf '%s' "$main_ci" | jq -r '.status')
  main_conclusion=$(printf '%s' "$main_ci" | jq -r '.conclusion // ""')
  main_ci_sha=$(printf '%s' "$main_ci" | jq -r '.headSha')

  if [ "$main_ci_sha" != "$main_sha" ]; then
    echo "[auto-merge] ${BASE_BRANCH} is at ${main_sha:0:8} but the newest CI run is for ${main_ci_sha:0:8} — waiting for CI to catch up"
    exit 0
  fi
  if [ "$main_status" != "completed" ]; then
    echo "[auto-merge] ${BASE_BRANCH} CI is still running — deferring to the next sweep"
    exit 0
  fi
  if [ "$main_conclusion" != "success" ]; then
    echo "[auto-merge] ${BASE_BRANCH} CI is ${main_conclusion} — refusing to merge onto a broken base" >&2
    exit 0
  fi
fi

# ── Reconcile: green main must be what is live ──────────────────────────────
# Reaching here means main's CI is green FOR MAIN'S CURRENT TIP (every other
# case exited above), so this commit is deployable. Ship it if it is not already
# shipped.
#
# This is a reconciler, not a trigger: it compares desired state (main's tip)
# with actual state (the last successful Deploy) and closes the gap. That makes
# it self-healing — a deploy that never fired, or fired and failed, is picked up
# by the next sweep instead of sitting merged-but-not-live forever. It is the
# only thing that actually ships, because the workflow_run chain cannot:
# GITHUB_TOKEN-started runs emit no workflow_run event (see the header note
# "HOW THE MERGE ACTUALLY REACHES THE BOX").
if [ -n "${main_ci:-}" ]; then
  running=$(gh run list --repo "$REPO" --workflow deploy.yml --limit 5 \
    --json status --jq '[.[] | select(.status != "completed")] | length')
  deployed_sha=$(gh run list --repo "$REPO" --workflow deploy.yml --branch "$BASE_BRANCH" \
    --status success --limit 1 --json headSha --jq '.[0].headSha // ""')

  if [ "${running:-0}" -gt 0 ]; then
    echo "[auto-merge] a deploy is already in flight — not dispatching another"
  elif [ "$deployed_sha" = "$main_sha" ]; then
    echo "[auto-merge] ${BASE_BRANCH} ${main_sha:0:8} is already deployed"
  else
    last_label="${deployed_sha:0:8}"
    echo "[auto-merge] ${BASE_BRANCH} is at ${main_sha:0:8}; last successful deploy was ${last_label:-none} — shipping"
    gh workflow run deploy.yml --repo "$REPO" --ref "$BASE_BRANCH"
  fi
fi

prs_json=$(gh pr list --repo "$REPO" --state open --base "$BASE_BRANCH" --limit 50 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,statusCheckRollup)

count=$(printf '%s' "$prs_json" | jq 'length')
if [ "$count" -eq 0 ]; then
  echo "[auto-merge] no open PRs"
  exit 0
fi

merged_any=0

# OLDEST FIRST. `gh pr list` returns newest-first, and this loop merges the
# first eligible PR and stops — so the newest green PR won every sweep and an
# older one could wait indefinitely. That is not theoretical: on 2026-08-06 the
# sweep merged #181 and #180 on consecutive passes while #155 (green since that
# morning), #176 and #178 sat untouched and were never even evaluated. With
# several agent sessions opening PRs continuously, "newest wins" is starvation,
# and the starved PR is the one that has been rebased against the most
# now-stale main.
#
# PR numbers increase monotonically with creation, so sorting by number ascending
# is FIFO. The ordering was never a decision — it was whatever gh happened to
# return — so make it one.
for number in $(printf '%s' "$prs_json" | jq -r 'sort_by(.number) | .[].number'); do
  pr=$(printf '%s' "$prs_json" | jq -c --argjson n "$number" '.[] | select(.number == $n)')
  title=$(printf '%s' "$pr" | jq -r '.title')

  # A rollup entry is either a CheckRun (status + conclusion) or a commit
  # StatusContext (state) — external services report as the latter.
  verdict=$(printf '%s' "$pr" | jq -r --argjson hold "$HOLD_LABELS" '
    def ok:
      if has("state") then (.state == "SUCCESS")
      else ((.status == "COMPLETED")
            and ((.conclusion // "") | test("^(SUCCESS|NEUTRAL|SKIPPED)$"))) end;
    def pending:
      if has("state") then (.state == "PENDING")
      else (.status != "COMPLETED") end;

    . as $pr
    | (($pr.statusCheckRollup) // []) as $checks
    | if $pr.isDraft then "skip: draft"
      elif ([$pr.labels[]?.name] | any(. as $l | $hold | index($l) != null))
        then "skip: hold label"
      elif ($checks | length) == 0 then "skip: no checks reported yet"
      elif ($checks | map(pending) | any) then "skip: checks still running"
      elif (($checks | map(ok) | all) | not) then "skip: checks not green"
      else "merge" end
  ')

  if [ "$verdict" != "merge" ]; then
    echo "[auto-merge] #${number} ${verdict} — ${title}"

    # A CANCELLED check is not a verdict, it is noise: ci.yml uses
    # `concurrency: cancel-in-progress: true`, so an unrelated newer run on the
    # same ref can kill a PR's build. Nothing ever re-runs it, the PR is never
    # green, and it would sit in this queue forever. Re-run it and let a later
    # sweep judge the real result. Genuine failures are left alone; only a run
    # with no real failure is retried.
    if [ "$verdict" = "skip: checks not green" ]; then
      retry_urls=$(printf '%s' "$pr" | jq -r '
        [ .statusCheckRollup[]?
          | select(has("state") | not)
          | select((.conclusion // "") == "CANCELLED")
          | .detailsUrl ] as $cancelled
        | [ .statusCheckRollup[]?
            | select(((.conclusion // .state // "")
                      | test("^(FAILURE|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE|ERROR)$"))) ] as $failed
        | if ($failed | length) == 0 then $cancelled[] else empty end
      ')
      for url in $retry_urls; do
        run_id=$(printf '%s' "$url" | grep -oE '/runs/[0-9]+' | grep -oE '[0-9]+' || true)
        [ -z "$run_id" ] && continue
        echo "[auto-merge] #${number} re-running cancelled run ${run_id}"
        gh run rerun "$run_id" --repo "$REPO" || echo "[auto-merge] #${number} could not re-run ${run_id}" >&2
      done
    fi
    continue
  fi

  # Mergeability is computed lazily by GitHub and is invalidated every time the
  # base branch moves — so right after a merge (exactly when this workflow runs)
  # every PR reports UNKNOWN. Poll until GitHub has an answer instead of
  # treating "not computed yet" as "not mergeable"; otherwise the fast path can
  # never merge anything and the whole train falls back to the cron.
  mergeable=""
  state=""
  for attempt in 1 2 3 4 5 6; do
    fresh=$(gh pr view "$number" --repo "$REPO" --json mergeable,mergeStateStatus)
    mergeable=$(printf '%s' "$fresh" | jq -r '.mergeable')
    state=$(printf '%s' "$fresh" | jq -r '.mergeStateStatus')
    [ "$mergeable" != "UNKNOWN" ] && break
    echo "[auto-merge] #${number} mergeability not computed yet (attempt ${attempt}) — waiting"
    sleep 5
  done

  if [ "$mergeable" != "MERGEABLE" ]; then
    echo "[auto-merge] #${number} skip: not mergeable (${mergeable}/${state}) — ${title}"
    continue
  fi

  echo "[auto-merge] #${number} green and ready — merging: ${title}"
  if gh pr merge "$number" --repo "$REPO" --squash --delete-branch; then
    merged_any=1
    echo "[auto-merge] #${number} merged"
    # One car per sweep: let CI verify this on main before coupling the next.
    break
  else
    # Losing a race (someone merged first, or main moved underneath) is normal;
    # the next sweep re-evaluates from fresh state.
    echo "[auto-merge] #${number} merge failed — leaving for the next sweep" >&2
  fi
done

if [ "$merged_any" -eq 1 ]; then
  # Verification only. The deploy happens in the reconciler at the top of the
  # NEXT sweep, once this CI run has proved the merge on main — dispatching
  # Deploy here would ship a commit whose main-CI has not finished.
  echo "[auto-merge] re-arming CI on ${BASE_BRANCH} to verify the merge"
  gh workflow run ci.yml --repo "$REPO" --ref "$BASE_BRANCH"
else
  echo "[auto-merge] nothing merged"
fi
