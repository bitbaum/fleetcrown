#!/usr/bin/env bash
# install-ledger-ready.sh — install the nightly-improver start gate (fleetcrown#136).
#
# Idempotent: re-run after a box rebuild or a change to ledger-ready-gate.sh.
# Ships the script from the repo rather than editing /usr/local/bin over ssh,
# so what runs on the box is what is reviewed here.
set -euo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
HOST="$BOX_ROOT"
HERE="$(dirname "${BASH_SOURCE[0]}")"

echo "→ ledger-ready: ship gate script"
scp -q "$HERE/ledger-ready-gate.sh" "$HOST:/usr/local/bin/fleetcrown-ledger-ready"
ssh "$HOST" "chmod +x /usr/local/bin/fleetcrown-ledger-ready"

echo "→ ledger-ready: unit + timer"
ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cat > /etc/systemd/system/fleetcrown-ledger-ready.service <<'SVC'
[Unit]
Description=Nightly-improver start gate — ping when the run ledger has real depth (fleetcrown#136)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/fleetcrown-ledger-ready
SVC

cat > /etc/systemd/system/fleetcrown-ledger-ready.timer <<'TMR'
[Unit]
Description=Check run-ledger depth daily (after the nightly autopilot window)

[Timer]
OnCalendar=*-*-* 07:23:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
# A unit left in `failed` keeps reporting the OLD crash forever, so the fix
# would look like it had not landed.
systemctl reset-failed fleetcrown-ledger-ready.service 2>/dev/null || true
systemctl enable --now fleetcrown-ledger-ready.timer
REMOTE

echo "→ ledger-ready: run once now"
ssh "$HOST" "systemctl start fleetcrown-ledger-ready.service; systemctl is-failed fleetcrown-ledger-ready.service || true; journalctl -u fleetcrown-ledger-ready -n 6 --no-pager | tail -6"
echo "✓ ledger-ready installed"
