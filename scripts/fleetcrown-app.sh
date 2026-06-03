#!/usr/bin/env bash
# fleetcrown-app.sh — starts the FleetCrown Next.js production server.
#
# Sources .env.local from the project root, then launches the standalone
# server. Intended to be called by the fleetcrown-app.service systemd unit.
#
# Usage: ./scripts/fleetcrown-app.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STANDALONE="$PROJECT_DIR/.next/standalone"

if [ ! -f "$STANDALONE/server.js" ]; then
  echo "[fleetcrown-app] ERROR: standalone build not found at $STANDALONE/server.js" >&2
  echo "[fleetcrown-app] Run: npm run build && npm run install-app" >&2
  exit 1
fi

# Load all vars from .env.local (set -a exports them to child processes).
if [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env.local"
  set +a
fi

# Defaults for production server — override in .env.local if needed.
export PORT="${PORT:-3000}"
# HOSTNAME is a bash builtin (set to machine name) — unset it so the standalone
# server defaults to 0.0.0.0 and is reachable at 127.0.0.1 / localhost.
unset HOSTNAME
# NEXTAUTH_URL must match the local URL so auth callbacks work.
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:${PORT}}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-${AUTH_SECRET:-}}"
export NODE_ENV="production"

exec node "$STANDALONE/server.js"
