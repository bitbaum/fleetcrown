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
# ONE PR PER SWEEP, AND ONLY ONTO A GREEN MAIN
# --------------------------------------------
# A PR's checks prove *that PR against the main it branched from* — not against
# the other PRs sitting next to it. Merging a batch in one pass would put a
# combination onto main that nothing ever built. So this script merges at most
# one PR, then hands control back to CI: the merge train advances one car per
# sweep, and every car is verified on main before the next one couples.
#
# For the same reason it refuses to merge while main's CI is red or still
# running. Red main => stop adding changes until it is fixed; running CI => the
# answer is not in yet. Both simply defer to the next sweep.
#
# THE CD RE-ARM (do not remove)
#   A push made with the default GITHUB_TOKEN does NOT trigger workflows. CI
#   runs on push-to-main and Deploy chains off CI (workflow_run), so a merge
#   from this script would otherwise land on main and never deploy. The explicit
#   workflow_dispatch of CI at the end restores that chain: CI runs on main ->
#   Deploy fires -> the box gets the new build. Silent no-deploy is the failure
#   mode this guards against, and it is the sharpest edge in the whole setup.

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

prs_json=$(gh pr list --repo "$REPO" --state open --base "$BASE_BRANCH" --limit 50 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,statusCheckRollup)

count=$(printf '%s' "$prs_json" | jq 'length')
if [ "$count" -eq 0 ]; then
  echo "[auto-merge] no open PRs"
  exit 0
fi

merged_any=0

for number in $(printf '%s' "$prs_json" | jq -r '.[].number'); do
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
  # BOTH of these are required, and Deploy is the non-obvious one.
  #
  # The GITHUB_TOKEN "no cascade" rule applies one level deeper than it first
  # appears. Dispatching CI here restores the CI run — but that run was itself
  # created by GITHUB_TOKEN, so ITS completion fires no workflow_run event
  # either, and Deploy (which listens for exactly that) never wakes. Observed
  # live on 2026-08-05: #161 merged, the re-armed CI went green on 6f82f691,
  # and zero Deploy runs were created. The merge landed and silently never
  # shipped. Deploy must therefore be dispatched directly, not chained.
  for wf in ci.yml deploy.yml; do
    echo "[auto-merge] re-arming ${wf} on ${BASE_BRANCH}"
    gh workflow run "$wf" --repo "$REPO" --ref "$BASE_BRANCH" \
      || echo "[auto-merge] could not dispatch ${wf} — is workflow_dispatch declared?" >&2
  done
else
  echo "[auto-merge] nothing merged; Deploy not triggered"
fi
