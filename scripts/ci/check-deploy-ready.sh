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
#
# TWO HALVES, AND WHY THEY ARE SEPARATE
#
# The first version of this gate inspected the sibling checkouts under DEV_ROOT
# and nothing else. That passes on the workstation, where all 15 are cloned, and
# fails in CI, where only this repo is — so it reported fifteen "missing" repos
# on a commit that touched none of them. A gate that judges state outside the
# commit is the exact thing that teaches everyone to pass --no-verify.
#
#   REGISTER INTEGRITY runs everywhere. apps.conf lives in THIS repo, so it is
#   in the diff, so CI can and must judge it.
#
#   FLEET INSPECTION runs only where the checkouts exist. Where they do not, it
#   is announced as not run — never silently skipped, because "no output" and
#   "all clear" looking identical is the bug this file exists to fix.
set -euo pipefail

# Resolved and USED before sourcing lib.sh, which sets its own $HERE and would
# otherwise silently repoint BASELINE_FILE at scripts/hetzner/. That collision
# made the ratchet read a missing file, fall back to the current count, and
# report "at baseline" for every value — a gate that could never fail.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BASELINE_FILE="$SELF_DIR/deploy-ready.baseline"

. "$SELF_DIR/../hetzner/lib.sh"

# ------------------------------------------------- half 1: register integrity
# In the diff, therefore CI's business. A malformed line here is what makes
# every downstream script reason about the wrong app.
FIELDS=12
bad=""; names=""; ports=""; total=0
while IFS= read -r line; do
  case "$line" in \#*|"") continue ;; esac
  total=$((total + 1))
  n=$(printf '%s' "$line" | awk -F'|' '{print NF}')
  name=$(printf '%s' "$line" | cut -d'|' -f1)
  port=$(printf '%s' "$line" | cut -d'|' -f2)
  [ "$n" = "$FIELDS" ] || bad="$bad\n    $name: $n fields, expected $FIELDS"
  case " $names " in *" $name "*) bad="$bad\n    $name: duplicate name" ;; esac
  names="$names $name"
  if printf '%s' "$port" | grep -qE '^[0-9]+$'; then
    case " $ports " in *" $port "*) bad="$bad\n    $name: port $port already taken" ;; esac
    ports="$ports $port"
  else
    bad="$bad\n    $name: port '$port' is not a number"
  fi
done < "$MANIFEST"

if [ -n "$bad" ]; then
  echo "✗ apps.conf is malformed:"
  printf "%b\n" "${bad#\\n}"
  echo "  The register is the SSOT for what runs here."
  exit 1
fi
echo "✓ register: $total entries, $FIELDS fields each, names and ports unique"

# -------------------------------------------------- half 2: fleet inspection
# Only meaningful where the sibling checkouts are present.
missing=""; stale=""; present=0
while IFS='|' read -r name port domains repo appdir rest; do
  case "$name" in \#*|"") continue ;; esac
  if [ ! -d "$repo" ]; then stale="$stale $name"; continue; fi
  present=$((present + 1))
  # "Has CI" means a workflow that actually verifies something — a repo whose
  # only workflow is deploy.yml has a pipeline, not a gate.
  if ls "$repo"/.github/workflows/*.y*ml >/dev/null 2>&1 \
     && grep -lqE "^name: *CI|type-check|npm run verify|npm test" "$repo"/.github/workflows/*.y*ml 2>/dev/null; then
    continue
  fi
  missing="$missing $name"
done < <(grep -v '^#' "$MANIFEST")

if [ "$present" = 0 ]; then
  echo "· fleet inspection NOT RUN: none of the $total checkouts exist under $DEV_ROOT."
  echo "  Expected in CI, which clones this repo only. Run it where the fleet lives:"
  echo "    bash scripts/ci/check-deploy-ready.sh"
  exit 0
fi

# A missing checkout is a REGISTER problem, not a CI problem. Reporting it as
# "no CI" sent me to add a workflow to a repo that already had one — the real
# fault was apps.conf pointing at /home/g/dev/s-ink, which does not exist.
# Distinguish them, or the gate lies about what to fix.
if [ -n "$stale" ]; then
  echo "✗ apps.conf points at repo paths that do not exist:"
  for r in $stale; do echo "    $r"; done
  echo "  $present of $total checkouts were found, so this is drift, not a bare"
  echo "  environment. Fix the path in apps.conf or clone the repo."
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
