#!/usr/bin/env bash
# Install the Hetzner rescale-availability watcher on bitbaum.
#
# Why: Falkenstein (fsn1) is capacity-blocked for cx-line rescales — the console
# LISTS cx43/cx53 as valid targets ("supported"), but the API's
# available_for_migration is empty, so a rescale actually fails. This installs a
# 10-min systemd timer that polls the real signal and Telegrams the moment a
# bigger tier opens, so George can seize the (often brief) window and rescale.
#
# Idempotent. Run as root on the box:  bash install-hcloud-watch.sh
# Requires a read-only hcloud API token in /opt/monitoring/hcloud.env:
#     HCLOUD_TOKEN=...   (chmod 600, root)
# Get one at: Hetzner Cloud Console → project → Security → API Tokens → Read.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

MON=/opt/monitoring
HERE="$(cd "$(dirname "$0")" && pwd)"

install -d -m755 "$MON"
install -m700 -o root -g root "$HERE/hcloud-availability.sh" "$MON/hcloud-availability.sh"

if [ ! -f "$MON/hcloud.env" ]; then
  cat > "$MON/hcloud.env" <<'EOF'
# Read-only Hetzner Cloud API token. Get one at:
# Console → project → Security → API Tokens → Generate (Read permission).
# HCLOUD_TOKEN=
EOF
  chmod 600 "$MON/hcloud.env"
  echo "⚠  $MON/hcloud.env created as a TEMPLATE — set HCLOUD_TOKEN (read-only) or the watcher stays silent."
fi

cat > /etc/systemd/system/hcloud-availability.service <<'SVC'
[Unit]
Description=Watch Hetzner rescale-availability for bitbaum (alert when cx43/cx53 open)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/monitoring/hcloud-availability.sh
SVC

cat > /etc/systemd/system/hcloud-availability.timer <<'TIMER'
[Unit]
Description=Poll Hetzner rescale availability every 10 min

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Persistent=true
Unit=hcloud-availability.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now hcloud-availability.timer
echo "✓ hcloud-availability.timer: $(systemctl is-active hcloud-availability.timer)"
echo "  next run: $(systemctl list-timers hcloud-availability.timer --no-pager 2>/dev/null | sed -n 2p | awk '{print $1,$2}')"
