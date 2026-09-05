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
# Log the RESPONSE BODY, not just the status. These janitors report what they
# actually did in their JSON — how many runs they closed, why they skipped, and
# for frontier-digest the per-judge scores behind every rejected proposal. This
# used to be `-o /dev/null`, so the only trace of a nightly job was
# "HTTP 200" and four completely different outcomes (did nothing / drafted
# nothing / everything rejected / crashed inside a caught block) were
# indistinguishable in the journal. The frontier loop surfaced no proposal for
# two months and nobody could say which of those it was.
#
# Truncated so a chatty job can't flood the journal, and the status line is kept
# on its own line so existing log greps still match.
#
# --fail-with-body, not -f: plain -f throws the body away on an HTTP error,
# which would leave the FAILING case — the one worth reading — as silent as it
# is today. This keeps curl's non-zero exit (so systemd still marks the unit
# failed) AND the error body. The `|| rc=$?` is what lets the body reach the
# journal before the script exits with that code; `set -e` would otherwise skip
# the echo on exactly the runs that need it.
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
rc=0
# fleetcrown-app.service documents a real window on every deploy restart where
# :4002 is "bound but refusing" (SIGTERM stops answering, then sits refused
# until SIGKILL frees the port for the new process — measured up to ~13s).
# Any *:15/*:30/*:45 cron tick that lands inside that window used to fail the
# whole oneshot outright and page the operator for an outage that resolved
# itself before the next tick. Retry ONLY curl's connection-refused (exit 7,
# the exact signature of that window) a few times with a short sleep; a real
# HTTP error status still fails on the first try, same as before.
RETRY_ATTEMPTS=5
RETRY_SLEEP_SECS=4
attempt=1
while :; do
  curl --fail-with-body -sS -m 120 "http://127.0.0.1:4002/api/crons/${NAME}" \
    -H "Authorization: Bearer ${SECRET}" \
    -o "$BODY_FILE" -w "fc-cron ${NAME}: HTTP %{http_code}\n" && { rc=0; break; } || rc=$?
  [ "$rc" -eq 7 ] && [ "$attempt" -lt "$RETRY_ATTEMPTS" ] || break
  sleep "$RETRY_SLEEP_SECS"
  attempt=$((attempt + 1))
done
echo "fc-cron ${NAME}: $(head -c 2000 "$BODY_FILE" | tr -d '\n')"
exit "$rc"
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
declare -A SCHED=( [prune-debug-logs]="03:00" [nudge-idle]="04:00" [prune-agent-tokens]="05:00" [email-canary]="06:00" [check-model-ids]="06:30" [check-telemetry]="06:45" [check-runner-version]="06:50" [sweep-orphan-alerts]="06:55" [send-digest-emails]="07:00" [frontier-digest]="08:00" [orangecat-promote-backfill]="09:00" [downgrade-expired-plans]="09:30" [propose-checkins]="09:45" [feedback-digest]="10:15" [reset-demo]="04:20" [reap-stale-runs]="*:15" [check-runner-stall]="*:30" [check-pending-approvals]="*:45" )
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
# SSOT: enable exactly what SCHED declares. Listing the names a second time is
# how a new job gets a timer written and never enabled — silently never running.
for name in "${!SCHED[@]}"; do
  systemctl enable --now "fc-cron@${name}.timer" >/dev/null 2>&1
done

echo "✓ installed FleetCrown cron timers (UTC):"
systemctl list-timers 'fc-cron@*' --all --no-pager | grep -E 'fc-cron|NEXT' || true
REMOTE
