#!/usr/bin/env bash
#
# Rename the GitHub owner across every workflow in the fleet.
#
#   sweep-gh-owner.sh <new-owner> [--dry-run] [--commit]
#
# WHY THIS EXISTS RATHER THAN A VARIABLE
#
# GitHub Actions requires a LITERAL owner/repo in `uses:`, and npm requires a
# literal in `github:owner/repo#tag` dependencies. Neither accepts a variable,
# so the owner is unavoidably repeated across the fleet.
#
# MATCHING — also learned the hard way. The first version matched "<owner>/"
# with a trailing slash, so it caught github.com/<owner>/repo but missed a bare
# "<owner>" in a string, a comment, or <owner>.github.io. Seven source files
# survived a sweep that reported success. Match the owner, not the owner-slash.
#
# SCOPE — learned the hard way. The first version of this script swept only
# .github/workflows/*.yml. That missed the dependencies in package.json, which
# is what actually breaks: `npm ci` cannot resolve github:<old-owner>/ai-kit,
# so every install fails, so every gate goes red on code that is fine, so
# everyone learns to pass --no-verify. A partial sweep is worse than none
# because it looks finished.
#
# A duplication you cannot remove is a duplication you have to OWN. Leaving it
# as "41 manual edits, remember to do them" is exactly the kind of step that
# gets skipped — the same shape as the repo Camille never got. So the sweep is
# a committed command, run once, verifiable.
#
# Everything that CAN read a single value already does: scripts/hetzner/_box-env.sh
# is the SSOT for GH_OWNER, SITES_BASE_DOMAIN, DEV_ROOT and the box address.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
. "$HERE/../hetzner/_box-env.sh"

NEW=""; DRY=0; COMMIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --commit)  COMMIT=1; shift ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  NEW="$1"; shift ;;
  esac
done
[ -n "$NEW" ] || { echo "usage: sweep-gh-owner.sh <new-owner> [--dry-run] [--commit]" >&2; exit 2; }

OLD="$GH_OWNER"
[ "$OLD" = "$NEW" ] && { echo "✓ already $NEW — nothing to sweep"; exit 0; }

echo "→ $OLD  →  $NEW   (workflows, package manifests, scripts, docs)"
touched=0; repos=0

for repo in "$DEV_ROOT"/*/; do
  # Not "has workflows" — bitbaum and camille-boulangerie carry the owner only
  # in documentation and were silently skipped by that condition. Any git repo
  # can hold a stale reference.
  [ -d "$repo/.git" ] || continue
  # Everything that can carry a literal owner. node_modules and .git excluded:
  # one is regenerated, the other is not ours to rewrite.
  files=$(grep -rl "$OLD" "$repo" \
            --include="*.yml" --include="*.yaml" --include="*.json" \
            --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
            --include="*.sh" --include="*.md" --include="*.toml" \
            --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next \
            2>/dev/null || true)
  [ -z "$files" ] && continue
  repos=$((repos + 1))
  n=$(echo "$files" | wc -l | tr -d ' ')
  printf '  %-28s %s file(s)\n' "$(basename "$repo")" "$n"
  if [ "$DRY" = 0 ]; then
    echo "$files" | while read -r f; do sed -i "s|${OLD}|${NEW}|g" "$f"; done
    touched=$((touched + n))
    if [ "$COMMIT" = 1 ] && git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
      git -C "$repo" add -A >/dev/null 2>&1 || true
      git -C "$repo" diff --cached --quiet || \
        git -C "$repo" commit -q -m "chore(ci): GitHub owner $OLD -> $NEW" || true
    fi
  fi
done

echo
if [ "$DRY" = 1 ]; then
  echo "DRY RUN — $repos repo(s) would change. Re-run without --dry-run."
else
  echo "✓ swept $repos repo(s)."
  echo "  Now set GH_OWNER in scripts/hetzner/_box-env.sh to '$NEW' so the SSOT agrees,"
  echo "  and update local remotes:  git -C <repo> remote set-url origin ..."
fi
