#!/usr/bin/env bash
# install-cockpit-app.sh — build and install Cockpit as a systemd user service.
#
# Run once after cloning, and again after significant dependency changes.
# The service auto-starts on login and restarts on crash.
#
# Usage: ./scripts/install-cockpit-app.sh [--skip-build]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="cockpit-app"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
STANDALONE="$PROJECT_DIR/.next/standalone"

log() { echo "[install-cockpit-app] $*"; }

# ── 1. Build ──────────────────────────────────────────────────────────────────

SKIP_BUILD=0
for arg in "$@"; do
  [ "$arg" = "--skip-build" ] && SKIP_BUILD=1
done

if [ "$SKIP_BUILD" = "0" ]; then
  log "Building production bundle (this takes ~2 minutes)…"
  cd "$PROJECT_DIR"
  npm run build
  log "Build complete."
else
  log "Skipping build (--skip-build)."
fi

# ── 2. Copy static assets into standalone ────────────────────────────────────
# next build --output standalone does NOT copy .next/static or public/ —
# they must be present alongside server.js for assets to be served.

log "Copying static assets to standalone…"
# Remove first so repeated installs don't nest directories (cp -r into an existing
# dir copies the source as a subdirectory of the dest, not the contents into it).
rm -rf "$STANDALONE/.next/static" "$STANDALONE/public"
cp -r "$PROJECT_DIR/.next/static" "$STANDALONE/.next/static"
cp -r "$PROJECT_DIR/public"       "$STANDALONE/public"
log "Static assets copied."

# ── 3. Write systemd user service ────────────────────────────────────────────

mkdir -p "$HOME/.config/systemd/user"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Cockpit — Life OS (local production server)
Documentation=https://github.com/g-but/cockpit
After=network.target

[Service]
Type=simple
WorkingDirectory=${STANDALONE}
ExecStart=${SCRIPT_DIR}/cockpit-app.sh
Restart=on-failure
RestartSec=5

# Log to journald — view with: journalctl --user -u ${SERVICE_NAME} -f
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

log "Service file written to $SERVICE_FILE"

# ── 4. Enable and start ───────────────────────────────────────────────────────

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"

if systemctl --user is-active --quiet "$SERVICE_NAME"; then
  log "Restarting $SERVICE_NAME…"
  systemctl --user restart "$SERVICE_NAME"
else
  log "Starting $SERVICE_NAME…"
  systemctl --user start "$SERVICE_NAME"
fi

# Give the server a moment to bind.
sleep 2

STATUS=$(systemctl --user is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
if [ "$STATUS" = "active" ]; then
  PORT=$(grep "^PORT=" "$PROJECT_DIR/.env.local" 2>/dev/null | cut -d= -f2 || echo "3000")
  PORT="${PORT:-3000}"
  log "✓ Cockpit is running at http://localhost:${PORT}"
  log "  Manage with: systemctl --user {status|stop|restart|logs} ${SERVICE_NAME}"
  log "  View logs:   journalctl --user -u ${SERVICE_NAME} -f"
else
  log "✗ Service did not start (status: $STATUS)"
  log "  Check logs: journalctl --user -u ${SERVICE_NAME} -n 50"
  exit 1
fi
