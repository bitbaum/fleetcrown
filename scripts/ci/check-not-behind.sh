#!/usr/bin/env bash
# check-not-behind.sh — refuse a deploy that would move production BACKWARDS.
#
# Usage: check-not-behind.sh <live_sha> <shipping_sha> [repo_dir]
#   exit 0 → safe to ship (fast-forward, redeploy, or undecidable-but-allowed)
#   exit 1 → refuse
#
# The sibling gate check-deploy-ref.sh asks "are you on main?". That is a
# different question, and it is why this one exists: every commit that ever
# landed on main passes the branch check forever, so a deploy run from a
# checkout sitting on a WEEK-OLD main sails straight through it and overwrites
# production with old code.
#
# That happened on 2026-08-15. CI shipped main and verified it live at 09:48;
# ten minutes later a hand-run deploy replaced it with a tree ~25 commits old,
# and for the next ten minutes production served code from the day before —
# including a health endpoint too old to report which commit it was running,
# which is what made the regression hard to see. It has happened before (see
# src/app/api/health/route.ts).
#
# The rule: the commit currently live must be an ANCESTOR of the commit being
# shipped. Then the deploy only ever adds history. Anything else — an older
# commit, or a sideways jump to an unrelated branch — drops whatever is live
# and is refused. ALLOW_ROLLBACK=1 is the deliberate override.
#
# Undecidable cases (no marker on the box, unresolvable SHA, a commit this
# checkout has never fetched) WARN and allow: this gate must never be the reason
# a box that is already broken cannot be repaired.
set -uo pipefail

LIVE="${1:-}"
SHIPPING="${2:-}"
REPO="${3:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

short() { printf '%.12s' "$1"; }
subject() { git -C "$REPO" log -1 --format=%s "$1" 2>/dev/null; }

if [ "${ALLOW_ROLLBACK:-}" = "1" ]; then
  echo "  ⚠ ALLOW_ROLLBACK=1 — skipping the not-behind check (deliberate rollback)"
  exit 0
fi

if [ -z "$LIVE" ]; then
  echo "  ⚠ box reports no build-ref — nothing to compare against, shipping anyway"
  exit 0
fi

if [ -z "$SHIPPING" ]; then
  echo "  ⚠ cannot resolve the commit being shipped — skipping the not-behind check"
  exit 0
fi

if ! git -C "$REPO" cat-file -e "${LIVE}^{commit}" 2>/dev/null; then
  echo "  ⚠ live build $(short "$LIVE") is unknown to this checkout — run \`git fetch\` to make this check meaningful; shipping anyway"
  exit 0
fi

if ! git -C "$REPO" cat-file -e "${SHIPPING}^{commit}" 2>/dev/null; then
  echo "  ⚠ shipping commit $(short "$SHIPPING") is not a commit in this checkout — skipping the not-behind check"
  exit 0
fi

if [ "$LIVE" = "$SHIPPING" ]; then
  echo "  ✓ not-behind: redeploying the commit already live ($(short "$LIVE"))"
  exit 0
fi

if git -C "$REPO" merge-base --is-ancestor "$LIVE" "$SHIPPING" 2>/dev/null; then
  echo "  ✓ not-behind: fast-forward $(short "$LIVE") → $(short "$SHIPPING")"
  exit 0
fi

{
  echo "✗ REFUSING TO DEPLOY — this would move production BACKWARDS."
  echo "    live on box : $(short "$LIVE")  $(subject "$LIVE")"
  echo "    this deploy : $(short "$SHIPPING")  $(subject "$SHIPPING")"
  echo "    The live commit is not an ancestor of what you are shipping, so this"
  echo "    ship would drop everything on the box that is not in your tree."
  echo "    Fix: git fetch && git rebase origin/main   (then redeploy)"
  echo "    Or:  ALLOW_ROLLBACK=1 <your deploy command>   if a rollback is what you mean."
} >&2
exit 1
