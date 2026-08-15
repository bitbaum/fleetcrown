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
  --json databaseId,status,conclusion,headSha --jq '.[0] // empty')

# Declared before the branch that can skip it (`set -u`; the merge site reads it).
main_red_jobs=""

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

    # A red base is usually transient. It becomes a DEADLOCK when the only PR
    # that repairs it is sitting in the queue: the guard blocks the fix for the
    # very thing the guard is blocking on, and nothing on either side can move.
    # Observed 2026-08-07 on aoz-housing — a green PR fixing master's E2E seed
    # waited while every sweep exited 0 on the line above, so from the outside
    # the automation looked healthy and idle. That is the third time in this
    # fleet that a permanent stall was indistinguishable from an ordinary skip.
    #
    # We deliberately do NOT merge onto a red base to break the cycle — that
    # guard is correct and load-bearing. We make the stall loud instead, and
    # name the candidates, so it reads as "needs a decision" rather than
    # "nothing to do". Breaking the tie stays a human/agent call.
    ready=$(gh pr list --repo "$REPO" --state open --base "$BASE_BRANCH" --limit 50 \
      --json number,title,isDraft,mergeStateStatus,labels \
      --jq "[ .[]
              | select(.isDraft | not)
              | select(.mergeStateStatus == \"CLEAN\")
              | select([.labels[].name] - ${HOLD_LABELS} == [.labels[].name])
              | \"  #\(.number) \(.title)\" ] | .[]" 2>/dev/null)

    if [ -n "$ready" ]; then
      echo "[auto-merge] ⚠ DEADLOCK: ${BASE_BRANCH} is red and these green PRs cannot land — one of them may be the fix:" >&2
      printf '%s\n' "$ready" >&2
      echo "[auto-merge] unstick by merging the PR that repairs ${BASE_BRANCH}, or by making ${BASE_BRANCH} green directly" >&2
    fi

    # ...and then actually unstick it, rather than only naming it. Reporting the
    # deadlock was half the fix; a human still had to break the tie, which is
    # the step this queue exists to remove. A PR whose own checks pass every job
    # the base fails is provably safe: those checks run on the MERGE result
    # (refs/pull/N/merge), so green there says the post-merge base is better
    # than the pre-merge base. Anything not covering them is refused below.
    main_run_id=$(printf '%s' "$main_ci" | jq -r '.databaseId')
    main_red_jobs=$(gh run view "${main_run_id}" --repo "$REPO" --json jobs \
      --jq '[.jobs[] | select(.conclusion == "failure") | .name] | .[]' 2>/dev/null || true)
    if [ -z "${main_red_jobs}" ]; then
      echo "[auto-merge] no failing job could be identified — refusing to merge onto a broken base" >&2
      exit 0
    fi
    echo "[auto-merge] ${BASE_BRANCH} fails: $(printf '%s' "${main_red_jobs}" | tr '\n' ' ') — a PR green on those exact jobs may still merge" >&2
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
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,statusCheckRollup,createdAt)

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

    # "No checks reported yet" is transient for a PR opened seconds ago and
    # PERMANENT for an old one: GitHub does not retroactively run workflows on
    # a PR nobody has pushed to, so it will sit here forever looking patient.
    # Report it; only a push, or a close/reopen, will ever produce checks.
    if [ "$verdict" = "skip: no checks reported yet" ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      created=$(printf '%s' "$pr" | jq -r '.createdAt // ""')
      if [ -n "$created" ] && [ "$created" \< "$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%SZ)" ]; then
        echo "- ⚠️ #${number} has no checks and is over 2h old — it will never gain any on its own — ${title}" >> "$GITHUB_STEP_SUMMARY"
      fi
    fi

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

  # A conflicted PR is not "not ready yet" — it is stuck, and nothing else will
  # unstick it. Skipping it quietly is how a PR sits DIRTY while the base moves
  # on: every sweep passes over it in silence and no signal ever reaches a
  # human. Say it loudly, and put it in the job summary where it is seen.
  if [ "$mergeable" = "CONFLICTING" ]; then
    echo "[auto-merge] #${number} CONFLICTS with ${BASE_BRANCH} and will never merge itself — ${title}" >&2
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      echo "- ⚠️ #${number} conflicts with \`${BASE_BRANCH}\` and needs resolving — ${title}" >> "$GITHUB_STEP_SUMMARY"
    fi
    continue
  fi

  if [ "$mergeable" != "MERGEABLE" ]; then
    echo "[auto-merge] #${number} skip: not mergeable (${mergeable}/${state}) — ${title}"
    continue
  fi

  # Keep the branch current instead of merging a PR that was proven against an
  # older base. This is also how conflicts surface EARLY: a branch updated on
  # the sweep after the merge that broke it fails here, minutes later, rather
  # than hours later when someone finally looks. One update per sweep, for the
  # same reason only one PR is merged per sweep.
  if [ "$state" = "BEHIND" ]; then
    echo "[auto-merge] #${number} is behind ${BASE_BRANCH} — updating it before merging: ${title}"
    if gh api -X PUT "repos/${REPO}/pulls/${number}/update-branch" --silent 2>/dev/null; then
      echo "[auto-merge] #${number} updated; its checks now run against current ${BASE_BRANCH}"
    else
      echo "[auto-merge] #${number} update-branch failed — leaving for the next sweep" >&2
    fi
    break
  fi

  # Red base: this PR merges only if it proves every failing job green.
  if [ -n "${main_red_jobs}" ]; then
    pr_green=$(printf '%s' "$pr" | jq -r '
      [ .statusCheckRollup[]?
        | select(((.conclusion // .state // "") | test("^(SUCCESS|NEUTRAL|SKIPPED)$")))
        | (.name // .context) ] | .[]')
    uncovered=""
    while IFS= read -r job; do
      [ -z "$job" ] && continue
      printf '%s\n' "$pr_green" | grep -Fxq "$job" || uncovered="${uncovered}${job}; "
    done <<INNER_EOF
${main_red_jobs}
INNER_EOF
    if [ -n "$uncovered" ]; then
      echo "[auto-merge] #${number} skip: ${BASE_BRANCH} is red on [${uncovered%; }] and this PR does not prove those green — ${title}"
      continue
    fi
    echo "[auto-merge] #${number} is green on every job ${BASE_BRANCH} fails — merging it to repair the base: ${title}" >&2
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
  # Verification AND, now, the ship signal. Dispatching Deploy from here would
  # ship a commit whose main-CI has not finished — so it still must not happen
  # here. Instead ci.yml's `ship` job dispatches Deploy the moment this run goes
  # green, which is the earliest correct moment.
  #
  # The reconciler at the top of the next sweep stays as the safety net: it now
  # catches only a deploy that never fired or that failed, rather than being the
  # normal path. That is the difference between polling for "did something get
  # missed?" (right) and polling for "did something just happen?" (up to ten
  # minutes late — 18.6 of #284's 26.8-minute merge→live).
  echo "[auto-merge] re-arming CI on ${BASE_BRANCH} to verify the merge (ci.yml ships it when green)"
  gh workflow run ci.yml --repo "$REPO" --ref "$BASE_BRANCH"
else
  echo "[auto-merge] nothing merged"
fi