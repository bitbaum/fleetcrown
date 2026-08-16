#!/usr/bin/env bash
#
# Stranded-work watch for the box's agent checkouts.
#
# WHY
# ---
# A cloud dispatch works in ~/dev/<project>, a tree the operator never opens. The
# operating contract (box-agent-claude.md) tells agents to commit, push, and open
# a PR — but a prompt is a soft guarantee, and the failure is SILENT: nobody
# discovers the loss, because nobody is looking at this filesystem. This makes
# the absence visible.
#
# WHAT COUNTS AS STRANDED — and what deliberately does NOT
# --------------------------------------------------------
# 1. A dirty working tree (uncommitted OR untracked). Unambiguous: this work
#    exists nowhere else and the next clone-on-demand can erase it.
#
# 2. A recent branch with NO upstream holding commits that are on no remote ref.
#    That is the exact shape of "the agent committed but never pushed".
#
# NOT flagged: a local branch merely AHEAD of its upstream. A stale clone's local
# `main` is routinely dozens of commits "ahead" of origin/main with work that was
# squash-merged long ago — on this very box, ~/dev/revampit reads 74 ahead / 129
# behind and every one of those 74 is already in main under a different SHA.
# Alerting on that would fire constantly and teach the operator to ignore the
# alert, which is worse than having no alert at all.
#
# The recency window is the second half of that guard: a no-upstream branch whose
# last commit is months old is an abandoned merged branch, not work an agent just
# stranded.
#
# Usage:
#   agent-work-check.sh              # check + alert on state changes
#   agent-work-check.sh --report     # print findings, never alert (safe anywhere)
#
# Overridable for tests (see test-agent-work-watch.sh):
#   MON        alert state/config dir      (default /opt/monitoring)
#   DEV_ROOT   checkout root to scan       (default /home/ubuntu/dev)
#   MAX_AGE_D  branch recency window, days (default 7)
set -uo pipefail   # NOT -e: one bad repo must never abort the sweep

MON="${MON:-/opt/monitoring}"
DEV_ROOT="${DEV_ROOT:-/home/ubuntu/dev}"
MAX_AGE_D="${MAX_AGE_D:-7}"
REPORT_ONLY=0
[ "${1:-}" = "--report" ] && REPORT_ONLY=1

# shellcheck source=/dev/null
if [ "$REPORT_ONLY" = 0 ]; then
  . "$MON/lib-alert.sh"
fi

now_epoch=$(date +%s)
max_age_s=$(( MAX_AGE_D * 86400 ))
findings=0

# The sweep runs as root but the checkouts belong to the runner user, and git
# refuses a repo it considers "dubious ownership" — every command fails, every
# repo gets skipped, and the sweep reports a confident zero. That is worse than
# no sweep: it is a monitor that cannot go red. safe.directory='*' is scoped to
# these read-only invocations; this script never writes to a repo.
GIT() { git -c safe.directory='*' "$@"; }

# The repo's default branch, resolved from the remote HEAD when available.
# A stale clone's local main is noise; we never want to treat it as agent work.
default_branch() {
  local repo="$1" d
  d=$(GIT -C "$repo" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
  d="${d#origin/}"
  [ -n "$d" ] && { printf '%s' "$d"; return; }
  for c in main master; do
    GIT -C "$repo" show-ref --verify --quiet "refs/heads/$c" && { printf '%s' "$c"; return; }
  done
  printf 'main'
}

scanned=0
for path in "$DEV_ROOT"/*; do
  [ -d "$path" ] || continue
  name=$(basename "$path")

  # A directory that LOOKS like a repo but that git will not open is reported,
  # never skipped. Silently continuing here is how this sweep first shipped a
  # confident "0 repo(s) with stranded work" while running as the wrong user —
  # a monitor that cannot go red is worse than none, because it is believed.
  if ! GIT -C "$path" rev-parse --git-dir >/dev/null 2>&1; then
    if [ -e "$path/.git" ]; then
      findings=$(( findings + 1 ))
      msg="UNREADABLE repo ${name} — looks like a checkout but git will not open it, so it cannot be checked for stranded work."
      if [ "$REPORT_ONLY" = 1 ]; then echo "$msg"; else alert_transition "agentwork_${name}" bad "🚫" "$msg"; fi
    fi
    continue
  fi
  scanned=$(( scanned + 1 ))
  problems=""

  # ── 1. dirty tree ─────────────────────────────────────────────────────────
  dirty=$(GIT -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  [ "${dirty:-0}" -gt 0 ] && problems="${problems}${dirty} uncommitted"

  # ── 2. recent, never-pushed branches ──────────────────────────────────────
  def=$(default_branch "$path")
  stranded_branches=""
  while IFS=$'\t' read -r branch committed; do
    [ -n "$branch" ] || continue
    [ "$branch" = "$def" ] && continue
    # An upstream means the branch is known to the remote — pushing further is
    # the operator's business, not stranded work.
    GIT -C "$path" rev-parse --abbrev-ref "${branch}@{upstream}" >/dev/null 2>&1 && continue
    # Old enough to be an abandoned merged branch rather than fresh agent work.
    [ $(( now_epoch - committed )) -gt "$max_age_s" ] && continue
    n=$(GIT -C "$path" log --oneline "$branch" --not --remotes 2>/dev/null | wc -l | tr -d ' ')
    [ "${n:-0}" -gt 0 ] && stranded_branches="${stranded_branches}${stranded_branches:+, }${branch}(${n})"
  done < <(GIT -C "$path" for-each-ref --format='%(refname:short)%09%(committerdate:unix)' refs/heads/ 2>/dev/null)

  if [ -n "$stranded_branches" ]; then
    problems="${problems}${problems:+; }unpushed: ${stranded_branches}"
  fi

  if [ -n "$problems" ]; then
    findings=$(( findings + 1 ))
    msg="STRANDED agent work in ${name} — ${problems}. It exists only on the box; nobody can see it."
    if [ "$REPORT_ONLY" = 1 ]; then
      echo "$msg"
    else
      alert_transition "agentwork_${name}" bad "🧟" "$msg"
    fi
  else
    [ "$REPORT_ONLY" = 1 ] || alert_transition "agentwork_${name}" ok "✅" "$name clean"
  fi
done

# Always state how many repos were actually READ. "0 stranded" means nothing
# without it — the number that matters is 0-of-21 vs 0-of-0.
[ "$REPORT_ONLY" = 1 ] && echo "— ${findings} repo(s) with stranded work, ${scanned} scanned under ${DEV_ROOT}"

# A root that exists but yields no readable repos is itself suspicious: the path
# moved, or permissions changed. Say so rather than reporting a clean sweep.
if [ "$scanned" -eq 0 ] && [ -d "$DEV_ROOT" ]; then
  msg="agent-work sweep read ZERO repos under ${DEV_ROOT} — the checkout root moved or is unreadable, so stranded work would go unnoticed."
  if [ "$REPORT_ONLY" = 1 ]; then echo "$msg"; else alert_transition "agentwork_sweep_reachable" bad "🚫" "$msg"; fi
elif [ "$REPORT_ONLY" = 0 ]; then
  alert_transition "agentwork_sweep_reachable" ok "✅" "sweep reachable"
fi
exit 0
