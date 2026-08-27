#!/usr/bin/env bash
#
# Rename the GitHub owner across every workflow in the fleet.
#
#   sweep-gh-owner.sh <new-owner> [--dry-run] [--commit]
#
# WHY THIS EXISTS RATHER THAN A VARIABLE
#
# GitHub Actions requires a LITERAL owner/repo in `uses:` — it will not accept
# `${{ vars.OWNER }}/fleetcrown/...`. So the owner is unavoidably repeated in
# every repo that calls the shared deploy workflow, currently 41 files.
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

echo "→ $OLD  →  $NEW   (across $DEV_ROOT/*/.github/workflows)"
touched=0; repos=0

for repo in "$DEV_ROOT"/*/; do
  [ -d "$repo/.github/workflows" ] || continue
  files=$(grep -rl "$OLD/" "$repo/.github/workflows" 2>/dev/null || true)
  [ -z "$files" ] && continue
  repos=$((repos + 1))
  n=$(echo "$files" | wc -l | tr -d ' ')
  printf '  %-28s %s file(s)\n' "$(basename "$repo")" "$n"
  if [ "$DRY" = 0 ]; then
    echo "$files" | while read -r f; do sed -i "s|${OLD}/|${NEW}/|g" "$f"; done
    touched=$((touched + n))
    if [ "$COMMIT" = 1 ] && git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
      git -C "$repo" add .github/workflows >/dev/null 2>&1 || true
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
