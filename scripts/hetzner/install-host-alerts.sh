#!/usr/bin/env bash
# Push-based alerting for the box — the piece a solo operator actually needs.
# Two mechanisms, both reusing the watchdog's Telegram channel + transition
# state, both ~zero RAM (systemd + a shell script on a timer; no daemon):
#
#   1. OnFailure alerts — a drop-in adds `OnFailure=notify-failure@%n` to every
#      *-app and appcron-* unit, so ANY unit that fails fires an instant Telegram
#      with the last journal lines. This is what turns "5 units failed silently
#      for weeks" (the audit finding) into "you knew within a minute".
#   2. Host checks — /opt/monitoring/host-check.sh (own timer) alerts, on
#      TRANSITION only, on: disk >85%, mem-available <400MB OR swap >90%,
#      `systemctl --failed` non-empty, postgres not accepting connections.
#
# Idempotent: re-run any time (after adding apps/crons) to (re)wire drop-ins.
# Alert target: /opt/monitoring/telegram.env (already present), else journal.
#
# Usage: install-host-alerts.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ssh -o BatchMode=yes "$BOX" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
MON=/opt/monitoring
mkdir -p "$MON/state"

# ── Shared alert helper (transition-aware, Telegram-or-journal) ──────────────
cat > "$MON/lib-alert.sh" <<'LIB'
#!/usr/bin/env bash
# Sourced by host-check.sh and notify-failure.sh. Provides:
#   alert <emoji> <text>              — send now (Telegram if configured, always journal)
#   alert_transition <key> <state> <emoji> <up-or-down-text>
#       — send only when <key> flips state (state file under $MON/state)
MON=/opt/monitoring
[ -f "$MON/telegram.env" ] && . "$MON/telegram.env" || true
alert() {
  local text="$1 $2"
  logger -t watchdog "$text"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${text}" -o /dev/null \
      || logger -t watchdog "ALERT telegram send failed"
  fi
}
alert_transition() {  # key state emoji text
  local key="$1" state="$2" emoji="$3" text="$4"
  local sf="$MON/state/host_$(printf '%s' "$key" | tr -c 'a-zA-Z0-9' '_')"
  local prev="ok"; [ -f "$sf" ] && prev=$(cat "$sf")
  [ "$state" = "$prev" ] && return 0
  printf '%s' "$state" > "$sf"
  [ "$state" = "bad" ] && alert "$emoji" "$text"
  [ "$state" = "ok" ]  && alert "✅" "RECOVERED: $key"
}
LIB

# ── OnFailure notifier (invoked as notify-failure@<unit>.service) ────────────
cat > "$MON/notify-failure.sh" <<'NF'
#!/usr/bin/env bash
# $1 = the failed unit name (passed as %i from the template).
set -uo pipefail
. /opt/monitoring/lib-alert.sh
unit="${1:-unknown.unit}"
tail=$(journalctl -u "$unit" -n 4 --no-pager -o cat 2>/dev/null | tr '\n' ' ' | cut -c1-300)
alert "🔴" "UNIT FAILED: ${unit} — ${tail:-<no log>}"
NF
chmod +x "$MON/notify-failure.sh"

cat > /etc/systemd/system/notify-failure@.service <<'SVC'
[Unit]
Description=Telegram alert for failed unit %i
[Service]
Type=oneshot
# %i is the failed unit name (systemd-escaped); notify-failure.sh unescapes for display.
ExecStart=/opt/monitoring/notify-failure.sh %i
SVC

# ── Host-resource checks ─────────────────────────────────────────────────────
cat > "$MON/host-check.sh" <<'HC'
#!/usr/bin/env bash
set -uo pipefail
. /opt/monitoring/lib-alert.sh

# Disk (root fs) — bad >85%
dp=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "${dp:-0}" -gt 85 ] && alert_transition disk bad "💾" "DISK ${dp}% on / (>85%)" || alert_transition disk ok "" ""

# Memory — bad when available <400MB AND swap >90% (both = real pressure, not
# just healthy cache use / idle pages parked in swap).
read -r _ _ _ _ _ avail <<<"$(free -m | awk '/^Mem:/')"
read -r _ st su _        <<<"$(free -m | awk '/^Swap:/')"
swpct=0; [ "${st:-0}" -gt 0 ] && swpct=$(( su * 100 / st ))
if [ "${avail:-9999}" -lt 400 ] && [ "$swpct" -gt 90 ]; then
  alert_transition mem bad "🧠" "MEM tight: ${avail}MB avail, swap ${swpct}%"
else
  alert_transition mem ok "" ""
fi

# Failed systemd units (excludes our own notifier so an alert can't self-trip)
failed=$(systemctl list-units --type=service --state=failed --no-legend 2>/dev/null \
  | awk '{print $1}' | grep -v '^notify-failure@' | tr '\n' ' ')
if [ -n "$failed" ]; then
  alert_transition units bad "⚙️" "FAILED UNITS: ${failed}"
else
  alert_transition units ok "" ""
fi

# Postgres accepting connections
if pg_isready -q 2>/dev/null; then
  alert_transition postgres ok "" ""
else
  alert_transition postgres bad "🐘" "POSTGRES not accepting connections"
fi
HC
chmod +x "$MON/host-check.sh"

cat > /etc/systemd/system/host-check.service <<'SVC'
[Unit]
Description=Box host-resource checks (disk/mem/failed-units/postgres)
After=network-online.target
[Service]
Type=oneshot
ExecStart=/opt/monitoring/host-check.sh
SVC
cat > /etc/systemd/system/host-check.timer <<'TIMER'
[Unit]
Description=Run host-check every 5 min
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
Persistent=true
Unit=host-check.service
[Install]
WantedBy=timers.target
TIMER

# ── Wire OnFailure into every app + appcron unit (drop-ins, non-destructive) ─
wired=0
for u in $(systemctl list-unit-files --no-legend '*-app.service' 'appcron-*.service' 2>/dev/null | awk '{print $1}'); do
  d="/etc/systemd/system/${u}.d"; mkdir -p "$d"
  cat > "$d/onfailure.conf" <<EOF
[Unit]
OnFailure=notify-failure@%n.service
EOF
  wired=$((wired+1))
done

systemctl daemon-reload
systemctl enable --now host-check.timer >/dev/null 2>&1 || true
echo "[host-alerts] wired OnFailure into $wired unit(s); host-check.timer active"
systemctl start host-check.service >/dev/null 2>&1 || true
echo "[host-alerts] initial host-check run: $(systemctl is-active host-check.service 2>/dev/null || echo done)"
REMOTE
echo "[host-alerts] installed on $BOX"
