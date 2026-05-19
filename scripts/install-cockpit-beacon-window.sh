#!/usr/bin/env bash
# install-cockpit-beacon-window.sh — register the cockpit-beacon-window user unit.
#
# Sister to install-cockpit-app.sh. Keeps a chromium --app=/beacon/live window
# pre-warmed so the popup is sub-100ms when a stop hook fires, matching the
# instant-feel PyQt used to have. Restart=always means the unit recovers if
# the user closes the window or the browser crashes.
#
# Usage: ./scripts/install-cockpit-beacon-window.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="cockpit-beacon-window"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

log() { echo "[install-cockpit-beacon-window] $*"; }

mkdir -p "$HOME/.config/systemd/user"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Cockpit beacon window (pre-warmed Chromium app for instant popup)
Documentation=https://github.com/g-but/cockpit
After=cockpit-app.service
Wants=cockpit-app.service

[Service]
Type=simple
ExecStart=${SCRIPT_DIR}/cockpit-beacon-window.sh
Restart=always
RestartSec=2
# Cap the restart rate so a permanently broken browser doesn't thrash systemd.
StartLimitBurst=10
StartLimitIntervalSec=60

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

log "Service file written to $SERVICE_FILE"

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"

if systemctl --user is-active --quiet "$SERVICE_NAME"; then
  log "Restarting $SERVICE_NAME…"
  systemctl --user restart "$SERVICE_NAME"
else
  log "Starting $SERVICE_NAME…"
  systemctl --user start "$SERVICE_NAME"
fi

sleep 2

STATUS=$(systemctl --user is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
if [ "$STATUS" = "active" ]; then
  log "✓ Beacon window service is running."
  log "  Manage with: systemctl --user {status|stop|restart} ${SERVICE_NAME}"
  log "  View logs:   journalctl --user -u ${SERVICE_NAME} -f"
else
  log "✗ Service did not start (status: $STATUS)"
  log "  Check logs: journalctl --user -u ${SERVICE_NAME} -n 50"
  exit 1
fi
