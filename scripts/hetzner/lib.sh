#!/usr/bin/env bash
# Shared helpers for the Hetzner self-host tooling. Source, don't execute.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
BOX="$BOX_UBUNTU"
# Overridable so a caller can judge a PRISTINE register instead of the working
# tree. On the workstation ~15 agent sessions share these checkouts, so the
# tree is a scratchpad: on 2026-08-28 the daily register check read apps.conf
# mid-edit (substrata listed twice) and paged about a duplicate port that had
# never been committed. CI still judges the working tree, which is correct
# there — in CI the working tree IS the commit under review.
MANIFEST="${MANIFEST:-$HERE/apps.conf}"

# default_branch [repo_dir] — the remote's default branch name, resolved not guessed.
#
# 28 repos here use `main`, 3 use `master` (aoz-housing, dotfiles,
# sbb-lost-found), and 2 have no origin/HEAD set at all. Anything that hardcodes
# "origin/main" silently does the wrong thing on a fifth of the fleet — a gate
# that cannot find its base branch either blocks everything or checks nothing.
#
# Order: the remote's own answer, then whichever of main/master exists, then
# fail. Never a hardcoded guess.
default_branch() {
  local repo="${1:-.}" b
  b=$(git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null) && { echo "${b#origin/}"; return 0; }
  for b in main master; do
    git -C "$repo" rev-parse --verify --quiet "refs/remotes/origin/$b" >/dev/null 2>&1 && { echo "$b"; return 0; }
  done
  # origin/HEAD unset and neither name present. Fix with:
  #   git remote set-head origin -a
  return 1
}


# app_lookup <name> — sets NAME PORT DOMAINS REPO APP_DIR DB or exits 1
app_lookup() {
  local line
  line=$(grep -v '^#' "$MANIFEST" | grep "^$1|" || true)
  [ -z "$line" ] && { echo "ERROR: '$1' not in $MANIFEST" >&2; return 1; }
  # Extra fields must be named, or bash's last variable swallows the remainder
  # and DB silently becomes "db|owner|kind|...". Missing trailing fields read as
  # empty, so a 6-field line still parses exactly as before.
  IFS='|' read -r NAME PORT DOMAINS REPO APP_DIR DB OWNER KIND STATUS PLAN PRICE SINCE <<<"$line"
}

app_names() { grep -v '^#' "$MANIFEST" | cut -d'|' -f1; }

# -n: don't consume stdin (box() is used inside while-read loops)
box() { ssh -n -o BatchMode=yes "$BOX" "$@"; }
