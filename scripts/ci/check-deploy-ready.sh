#!/usr/bin/env bash
#
# Every deployed app must have CI. Ratcheted: the count may fall, never rise.
#
# WHY
#
# ci-gate.sh exits 0 for "CI green" AND for "no CI configured" — both let a
# deploy through. That is a reasonable default and it means absence is
# indistinguishable from success: an app with no workflow ships every push
# completely unverified while looking exactly like one that passed.
#
# Substrata did that for a day. sinktattoo.com — a real client's site — is doing
# it now. Nothing reported either, because nothing was looking.
#
# The template now emits ci.yml with every new site, which fixes the future. This
# fixes the past: the exceptions are listed, counted, and the count can only go
# down. Same ratchet shape as the shared-inventory check.
set -euo pipefail

# Resolved and USED before sourcing lib.sh, which sets its own $HERE and would
# otherwise silently repoint BASELINE_FILE at scripts/hetzner/. That collision
# made the ratchet read a missing file, fall back to the current count, and
# report "at baseline" for every value — a gate that could never fail.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BASELINE_FILE="$SELF_DIR/deploy-ready.baseline"

. "$SELF_DIR/../hetzner/lib.sh"
missing=""; stale=""; total=0

while IFS='|' read -r name port domains repo appdir rest; do
  case "$name" in \#*|"") continue ;; esac
  total=$((total + 1))
  # A missing checkout is a REGISTER problem, not a CI problem. Reporting it as
  # "no CI" sent me to add a workflow to a repo that already had one — the real
  # fault was apps.conf pointing at /home/g/dev/s-ink, which does not exist.
  # Distinguish them, or the gate lies about what to fix.
  if [ ! -d "$repo" ]; then
    stale="$stale $name"
    continue
  fi
  # "Has CI" means a workflow that actually verifies something — a repo whose
  # only workflow is deploy.yml has a pipeline, not a gate.
  if ls "$repo"/.github/workflows/*.y*ml >/dev/null 2>&1 \
     && grep -lqE "^name: *CI|type-check|npm run verify|npm test" "$repo"/.github/workflows/*.y*ml 2>/dev/null; then
    continue
  fi
  missing="$missing $name"
done < <(grep -v '^#' "$MANIFEST")

if [ -n "$stale" ]; then
  echo "✗ apps.conf points at repo paths that do not exist:"
  for r in $stale; do echo "    $r"; done
  echo "  The register is the SSOT for what runs here. A wrong path there makes"
  echo "  every other check reason about a repository that is not present."
  exit 1
fi

count=$(echo $missing | wc -w | tr -d ' ')
baseline=$(cat "$BASELINE_FILE" 2>/dev/null || echo "$count")

if [ "$count" -gt "$baseline" ]; then
  echo "✗ $count deployed app(s) have no CI, up from a baseline of $baseline:"
  for m in $missing; do echo "    $m — deploys unverified on every push"; done
  echo
  echo "  A new app without CI is a regression. Add .github/workflows/ci.yml"
  echo "  (scripts/site-template/.github/workflows/ci.yml is the one the scaffold emits)."
  exit 1
fi

if [ "$count" -lt "$baseline" ]; then
  echo "✓ deploy-ready: $count without CI (was $baseline) — lower the baseline:"
  echo "    echo $count > $BASELINE_FILE"
elif [ "$count" -gt 0 ]; then
  echo "✓ deploy-ready: $count of $total deployed app(s) still without CI (at baseline):$missing"
else
  echo "✓ deploy-ready: all $total deployed apps have CI"
fi
