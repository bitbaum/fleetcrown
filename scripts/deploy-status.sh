#!/usr/bin/env bash
# deploy-status.sh — what's live, what's pending, is it healthy? One glance.
#
# WHY: the only way to answer "what SHA is on the box / did my deploy land / is
# one still running" used to be `curl … | grep sentry-release` plus grepping a
# shared log full of stale lines. This reads the per-SHA deploy logs the hook
# now writes and shows the whole picture at once.
#
# Usage: bash scripts/deploy-status.sh   (or: npm run deploy:status)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROD_URL="${FLEETCROWN_WEB_URL:-https://fleetcrown.orangecat.ch}"

cd "$PROJECT_DIR"
LOCAL=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
git fetch origin main -q 2>/dev/null || true
ORIGIN=$(git rev-parse --short origin/main 2>/dev/null || echo "?")

LIVE=$(curl -s --max-time 6 "$PROD_URL/sign-in" 2>/dev/null | grep -oiE 'sentry-release=[a-f0-9]{7}' | head -1 | cut -d= -f2)
LIVE="${LIVE:-unknown}"
# curl's -w prints the code even on failure (000 = unreachable); no fallback needed.
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "$PROD_URL/api/health" 2>/dev/null)
HEALTH="${HEALTH:-000}"

# In-flight deploy (the flock'd deploy-hetzner.sh carries --ref <sha>)
INFLIGHT=$(pgrep -af 'deploy-hetzner\.sh' 2>/dev/null | grep -v pgrep \
  | grep -oE -- '--ref [a-f0-9]+' | awk '{print substr($2,1,7)}' | head -1)

echo "── FleetCrown deploy status ──────────────────────────────"
printf "  %-14s %s\n" "local HEAD"  "$LOCAL"
printf "  %-14s %s\n" "origin/main" "$ORIGIN"
printf "  %-14s %s  (health %s)\n" "live on box" "$LIVE" "$HEALTH"

if [ "$LIVE" = "unknown" ]; then
  echo "  ⚠ could not read live SHA (box unreachable from here — the box itself may be fine)"
elif [ "${LIVE:0:7}" = "${ORIGIN:0:7}" ]; then
  echo "  ✓ box is up to date with origin/main"
else
  echo "  ● box is BEHIND origin/main — a deploy is needed or in flight"
fi

if [ -n "$INFLIGHT" ]; then
  echo "  ⟳ deploy IN FLIGHT for $INFLIGHT"
else
  echo "  · no deploy currently running"
fi

# Most recent per-SHA deploy log — show its verdict line.
LASTLOG=$(ls -t /tmp/push-deploy-fleetcrown-*.log 2>/dev/null | grep -v latest | head -1)
if [ -n "$LASTLOG" ]; then
  echo "── last deploy log: $LASTLOG"
  grep -aiE 'deploy OK:|deployed .* verified|deploy FAILED|rolling box back|BLOCKED by CI|superseded' "$LASTLOG" 2>/dev/null | tail -3 | sed 's/^/  /'
fi
echo "──────────────────────────────────────────────────────────"
