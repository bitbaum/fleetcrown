#!/usr/bin/env bash
# prune-merged.sh — tidy up local branches, conservatively.
#
# Deletes only branches that are SAFE to lose:
#   1. upstream gone   — the remote branch was deleted (merged PR, cleanup)
#   2. ancestry-merged — fully merged into origin/main (git branch --merged)
# Never touches the current branch, main/master, or anything with unmerged
# commits. Content-merged-but-different-SHA branches (rare) are left for a human.
#
# Usage: bash scripts/git/prune-merged.sh   (or: npm run git:prune)
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
git fetch --prune origin -q 2>/dev/null || true
CURRENT=$(git branch --show-current 2>/dev/null || echo "")
deleted=0

# 1) upstream gone
while IFS= read -r b; do
  [ -z "$b" ] && continue
  [ "$b" = "$CURRENT" ] && continue
  if git branch -D "$b" >/dev/null 2>&1; then
    echo "  deleted (upstream gone): $b"; deleted=$((deleted+1))
  fi
done < <(git branch -vv | awk '/: gone\]/{print $1}' | sed 's/^[*+] *//')

# 2) fully merged into origin/main (ancestry) — safe delete
while IFS= read -r b; do
  case "$b" in main|master|"$CURRENT"|"") continue ;; esac
  if git branch -d "$b" >/dev/null 2>&1; then
    echo "  deleted (merged into main): $b"; deleted=$((deleted+1))
  fi
done < <(git branch --merged origin/main --format='%(refname:short)' 2>/dev/null)

echo "  git:prune — removed $deleted local branch(es)"
