#!/usr/bin/env bash
# install-hetzner-crons.sh — install the scheduled-job timers on the Hetzner box.
#
# The box (fleetcrown.orangecat.ch, systemd fleetcrown-app on 127.0.0.1:4002)
# runs the /api/crons/* janitors + email canary via systemd timers. Schedules are in UTC
# (the box is Etc/UTC).
#
# Idempotent — safe to re-run after a box rebuild or schedule change.
#
# Usage: bash scripts/install-hetzner-crons.sh

set -euo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/hetzner/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
HOST="$BOX_ROOT"

ssh -o BatchMode=yes "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail

# Runner: reads CRON_SECRET from the app .env and calls the local app. The
# secret never leaves the box and isn't duplicated into the unit files.
cat > /opt/fleetcrown/fc-cron.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ENV_FILE=/opt/fleetcrown/app/.env
SECRET="$(grep -m1 '^CRON_SECRET=' "$ENV_FILE" | sed 's/^CRON_SECRET=//; s/^"//; s/"$//' | tr -d '\r')"
NAME="$1"
curl -fsS -m 120 "http://127.0.0.1:4002/api/crons/${NAME}" \
  -H "Authorization: Bearer ${SECRET}" \
  -o /dev/null -w "fc-cron ${NAME}: HTTP %{http_code}\n"
SH
chmod +x /opt/fleetcrown/fc-cron.sh

cat > /etc/systemd/system/fc-cron@.service <<'SVC'
[Unit]
Description=FleetCrown scheduled job %i
After=network-online.target fleetcrown-app.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/fleetcrown/fc-cron.sh %i
SVC

# Times are "HH:MM" (daily) or "*:MM" (hourly) — both expand to OnCalendar=*-*-* <val>:00.
declare -A SCHED=( [prune-debug-logs]="03:00" [nudge-idle]="04:00" [prune-agent-tokens]="05:00" [email-canary]="06:00" [send-digest-emails]="07:00" [frontier-digest]="08:00" [orangecat-promote-backfill]="09:00" [downgrade-expired-plans]="09:30" [propose-checkins]="09:45" [reap-stale-runs]="*:15" [check-runner-stall]="*:30" )
for name in "${!SCHED[@]}"; do
  cat > "/etc/systemd/system/fc-cron@${name}.timer" <<TIMER
[Unit]
Description=FleetCrown cron timer: ${name}

[Timer]
OnCalendar=*-*-* ${SCHED[$name]}:00
Persistent=true
Unit=fc-cron@${name}.service

[Install]
WantedBy=timers.target
TIMER
done

systemctl daemon-reload
for name in prune-debug-logs nudge-idle prune-agent-tokens email-canary send-digest-emails frontier-digest orangecat-promote-backfill downgrade-expired-plans propose-checkins reap-stale-runs check-runner-stall; do
  systemctl enable --now "fc-cron@${name}.timer" >/dev/null 2>&1
done

echo "✓ installed FleetCrown cron timers (UTC):"
systemctl list-timers 'fc-cron@*' --all --no-pager | grep -E 'fc-cron|NEXT' || true
REMOTE
