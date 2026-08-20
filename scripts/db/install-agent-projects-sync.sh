#!/usr/bin/env bash
# Installs sync-agent-projects-conf.sh as a local systemd --user timer, so
# ~/.config/agent-projects.conf stays in sync with the FleetCrown project
# registry without anyone remembering to run it by hand. Idempotent — safe
# to re-run (e.g. after the repo moves, or to pick up a schedule change).
#
# Usage: scripts/db/install-agent-projects-sync.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYNC_SCRIPT="$REPO_ROOT/scripts/db/sync-agent-projects-conf.sh"
UNIT_DIR="$HOME/.config/systemd/user"

if [[ ! -x "$SYNC_SCRIPT" ]]; then
  echo "install-agent-projects-sync: $SYNC_SCRIPT missing or not executable" >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/agent-projects-sync.service" <<EOF
[Unit]
Description=Sync ~/.config/agent-projects.conf from FleetCrown's project registry
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$SYNC_SCRIPT
StandardOutput=journal
StandardError=journal
EOF

cat > "$UNIT_DIR/agent-projects-sync.timer" <<'EOF'
[Unit]
Description=Periodic sync of agent-projects.conf from FleetCrown's project registry

[Timer]
OnBootSec=2m
OnUnitActiveSec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now agent-projects-sync.timer

echo "Installed agent-projects-sync.timer (runs every 15m, plus 2m after boot)."
echo "Status:  systemctl --user status agent-projects-sync.timer"
echo "Logs:    journalctl --user -u agent-projects-sync.service -n 20"
echo "Run now: systemctl --user start agent-projects-sync.service"
