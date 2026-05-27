#!/usr/bin/env bash
# deploy-local.sh — runs automatically as the npm postbuild hook.
#
# Copies runtime assets into .next/standalone/ (required for the production
# server to serve CSS, JS chunks, public files, and markdown content) then restarts
# the cockpit-app systemd service if it is installed on this machine.
#
# Skips silently in CI or on machines where the service is not installed, so
# running `npm run build` on Vercel / GitHub Actions stays clean.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STANDALONE="$PROJECT_DIR/.next/standalone"

if [ ! -d "$STANDALONE" ]; then
  # Standalone output not present (e.g. output: "export" override or CI).
  exit 0
fi

# ── Copy runtime assets ───────────────────────────────────────────────────────
# Next standalone tracing does not include client/static assets or markdown
# loaded from process.cwd() by server-rendered content routes.
rm -rf "$STANDALONE/.next/static" "$STANDALONE/public" "$STANDALONE/content"
cp -r "$PROJECT_DIR/.next/static"  "$STANDALONE/.next/static"
cp -r "$PROJECT_DIR/public"        "$STANDALONE/public"
cp -r "$PROJECT_DIR/content"       "$STANDALONE/content"
echo "→ deploy: runtime assets copied to standalone"

# ── Restart systemd service (local machine only) ──────────────────────────────
SERVICE="cockpit-app"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE}.service"

if [ -f "$SERVICE_FILE" ] && systemctl --user is-enabled --quiet "$SERVICE" 2>/dev/null; then
  systemctl --user restart "$SERVICE"
  echo "→ deploy: cockpit-app service restarted"
fi
