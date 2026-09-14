#!/usr/bin/env bash
#
# Install the Loki end-to-end watch: every six hours the box asks the live
# site, as the operator, whether Loki knows the fleet, publishes the map and
# (when the builder is authenticated) closes the dispatch loop — and alerts on
# the flip. See loki-e2e-check.sh and scripts/test/loki-loop-e2e.ts.
#
# The checker runs from /opt/loki/runner, which install-box-runner.sh keeps in
# sync with the repo (src/, scripts/, node_modules), so re-run that first when
# the test itself changed.
#
# Idempotent. Usage:  bash scripts/hetzner/install-loki-e2e-watch.sh [user@host]
set -euo pipefail
. "$(dirname "$0")/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
HOST="${1:-$BOX_ROOT}"
MON=/opt/monitoring
SRC="$(dirname "$0")/loki-e2e-check.sh"
[ -f "$SRC" ] || { echo "✗ missing $SRC" >&2; exit 1; }

echo "→ loki-e2e-watch: installing checker"
scp -q "$SRC" "$HOST:$MON/loki-e2e-check.sh"
ssh "$HOST" "chmod 0755 $MON/loki-e2e-check.sh"

echo "→ loki-e2e-watch: writing unit + timer"
ssh "$HOST" "cat > /etc/systemd/system/loki-e2e.service" <<'UNIT'
[Unit]
Description=Loki: end-to-end check of the live site as the operator
After=network-online.target loki-app.service
[Service]
Type=oneshot
# Root: reads the app env to mint a session and the monitoring state dir.
ExecStart=/opt/monitoring/loki-e2e-check.sh
TimeoutStartSec=1800
UNIT
ssh "$HOST" "cat > /etc/systemd/system/loki-e2e.timer" <<'TIMER'
[Unit]
Description=Loki: end-to-end check (every 6h)
[Timer]
# Six-hourly: the dispatch leg is a real run on the builder. Often enough that
# a broken loop is known the same day; rare enough not to crowd real work.
OnCalendar=*-*-* 01,07,13,19:40:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
TIMER

echo "→ loki-e2e-watch: enabling"
ssh "$HOST" "systemctl daemon-reload && systemctl enable --now loki-e2e.timer && systemctl list-timers loki-e2e --no-pager | tail -2"
echo "→ loki-e2e-watch: first run (report only, no alerts)"
ssh "$HOST" "$MON/loki-e2e-check.sh --report" | tail -12
echo "✓ loki-e2e-watch installed. Manual check: ssh $HOST $MON/loki-e2e-check.sh --report"
