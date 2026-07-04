#!/usr/bin/env bash
# Optional production UI dogfood on git push when SMOKE_PRIVATE_PIN is set.
#
#   SMOKE_PRIVATE_PIN=55550 git push          # smoke + ui-flows; loki if builder online
#   DOGFOOD_LOKI_ON_PUSH=1 … git push         # force loki dogfood even when builder offline
#
# Requires AUTH_SECRET + HETZNER_IP (or FLEETCROWN_SESSION_TOKEN) for JWT mint.
# Skips silently when SMOKE_PRIVATE_PIN is unset so default pushes stay fast.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${SMOKE_PRIVATE_PIN:-}" ]; then
  echo "→ prod dogfood: skipped (set SMOKE_PRIVATE_PIN to enable ui-flows + loki on push)"
  exit 0
fi

export BASE="${BASE:-https://fleetcrown.orangecat.ch}"
export SMOKE_PRIVATE_PIN
export HEADLESS=1

echo "→ prod dogfood: minting session ($BASE)"
TOKEN="$(npx tsx scripts/test/print-session-token.ts)"
export FLEETCROWN_SESSION_TOKEN="$TOKEN"

echo "→ test:authenticated-smoke"
npm run test:authenticated-smoke

echo "→ dogfood:ui-flows:ci"
node scripts/ui-flow-dogfood.mjs

RUN_LOKI=0
if [ "${DOGFOOD_LOKI_ON_PUSH:-${DOFOOD_LOKI_ON_PUSH:-}}" = "1" ]; then
  RUN_LOKI=1
else
  PRESENCE="$(curl -sf --max-time 20 \
    -H "Cookie: __Secure-authjs.session-token=$TOKEN" \
    "$BASE/api/builder/presence" 2>/dev/null || echo '{}')"
  if echo "$PRESENCE" | grep -qE '"runnerConnected":\s*true'; then
    RUN_LOKI=1
  fi
fi

if [ "$RUN_LOKI" = "1" ]; then
  echo "→ dogfood:loki:ci"
  node scripts/loki-dogfood.mjs
else
  echo "→ dogfood:loki:ci skipped (builder offline — export DOGFOOD_LOKI_ON_PUSH=1 to force)"
fi

echo "→ dogfood:machine (skips when no local Fleet Runner)"
node scripts/machine-dogfood.mjs
