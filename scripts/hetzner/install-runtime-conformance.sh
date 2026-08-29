#!/usr/bin/env bash
# install-runtime-conformance.sh — run the runtime conformance audit on the box
# and alert to Telegram, per finding, on transition.
#
# The audit itself ships in the repo (scripts/ci/runtime-conformance-audit.sh)
# and the deploy rsyncs it to /opt/fleetcrown/app, so there is ONE copy. This
# installs only the wrapper and the timer.
#
# Per-FINDING alert keys, never one aggregate: host-check spent six weeks unable
# to fire because a single permanently-failed unit pinned one boolean at `bad`.
# A new finding must always transition, whatever else is already broken.
#
# Idempotent. Usage: bash scripts/hetzner/install-runtime-conformance.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ssh -o BatchMode=yes "$BOX" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
MON=/opt/monitoring
mkdir -p "$MON/state"

cat > "$MON/runtime-conformance.sh" <<'CHK'
#!/usr/bin/env bash
# Wrapper: run the audit, alert per finding. Invoked by the timer.
#
# NOT `set -e`: the audit exits non-zero precisely when it has something to say,
# and -e would kill this before it could say it.
set -u
MON="${MON:-/opt/monitoring}"
. "$MON/lib-alert.sh"
AUDIT=/opt/fleetcrown/app/scripts/ci/runtime-conformance-audit.sh

# "Could not look" gets its OWN key so it can never overwrite a real finding
# or be mistaken for a clean run.
if [ ! -r "$AUDIT" ]; then
  alert_transition rtc_probe bad "🔎" "Runtime conformance CANNOT RUN: $AUDIT missing (deploy changed?)"
  exit 0
fi
alert_transition rtc_probe ok "🔎" ""

out=$(bash "$AUDIT" 2>&1)

# One key per app+check, so a new finding always transitions.
declare -A seen=()
while IFS='|' read -r kind app msg; do
  [ "$kind" = "FINDING" ] || continue
  key="rtc_$(printf '%s' "$app $msg" | tr -c 'a-zA-Z0-9' '_' | cut -c1-60)"
  seen[$key]=1
  alert_transition "$key" bad "🧩" "$app: $msg"
done <<< "$out"

# A finding that has gone away clears its own key, or its next occurrence
# would be silent.
for sf in "$MON"/state/host_rtc_*; do
  [ -e "$sf" ] || continue
  k=$(basename "$sf"); k=${k#host_}
  case "$k" in rtc_probe) continue ;; esac
  [ -n "${seen[$k]:-}" ] || alert_transition "$k" ok "" ""
done
exit 0
CHK
chmod +x "$MON/runtime-conformance.sh"

cat > /etc/systemd/system/fleetcrown-runtime-conformance.service <<'SVC'
[Unit]
Description=Runtime conformance audit (what is deployed, not what is committed)
OnFailure=notify-failure@%n.service
[Service]
Type=oneshot
ExecStart=/opt/monitoring/runtime-conformance.sh
SVC

cat > /etc/systemd/system/fleetcrown-runtime-conformance.timer <<'TMR'
[Unit]
Description=Run the runtime conformance audit every 6h
[Timer]
OnCalendar=*-*-* 02,08,14,20:00:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now fleetcrown-runtime-conformance.timer >/dev/null
systemctl list-timers --all --no-pager | grep runtime-conformance || true
REMOTE
