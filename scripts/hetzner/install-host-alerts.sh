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
#      TRANSITION only, on: disk >85% (recovering only under 80%, so a disk
#      parked on the mark can't flap), mem-available <400MB OR swap >90%,
#      `systemctl --failed` non-empty, postgres not accepting connections.
#
# Logic here is covered by scripts/hetzner/test-host-alerts.sh (npm run test:ops),
# which extracts the heredoc payloads below and drives them with stubbed tools.
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
# MON is overridable so test-host-alerts.sh can exercise this exact code against
# a temp dir; prod never sets it and gets /opt/monitoring.
MON="${MON:-/opt/monitoring}"
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
  if [ "$state" = "bad" ]; then alert "$emoji" "$text"; else alert "✅" "RECOVERED: $key"; fi
  # MUST return 0 unconditionally. A trailing `[ "$state" = "ok" ] && alert ...`
  # here returned 1 on the bad path, so a caller written as
  #   check && alert_transition k bad ... || alert_transition k ok ...
  # ran the `ok` branch immediately after alerting — resetting the state file and
  # re-alerting every tick (the 2026-08-05 disk-alert storm: 40 alert/RECOVERED
  # pairs in 3h). Callers must never be able to read a branch's exit status as
  # "the check failed".
  return 0
}
LIB

# ── OnFailure notifier (invoked as notify-failure@<unit>.service) ────────────
cat > "$MON/notify-failure.sh" <<'NF'
#!/usr/bin/env bash
# $1 = the failed unit name (passed as %i from the template).
# Recovery-aware: a long-running service (Type != oneshot) that is back active
# a few seconds after the failure was a DEPLOY RESTART or a Restart=-recovered
# blip, not an outage — journal-only, no Telegram (kills the alert fatigue that
# fired on every deploy: a Next proc SIGKILLed after TimeoutStopSec marks the
# unit failed → OnFailure, even though the new version is healthy). Only PAGE
# when it stays down. oneshot units (appcron jobs) never go "active", so a
# failed cron always pages — a failed job is a real signal. Sustained crash
# loops are also caught by host-check's `systemctl --failed` sweep.
set -uo pipefail
. /opt/monitoring/lib-alert.sh
unit="${1:-unknown.unit}"
utype=$(systemctl show "$unit" -p Type --value 2>/dev/null)
if [ "$utype" != "oneshot" ]; then
  sleep 8
  if systemctl is-active --quiet "$unit"; then
    logger -t watchdog "unit ${unit} failed but recovered (restart/transient) — not paging"
    exit 0
  fi
fi
tail=$(journalctl -u "$unit" -n 4 --no-pager -o cat 2>/dev/null | tr '\n' ' ' | cut -c1-300)
alert "🔴" "UNIT DOWN: ${unit} — ${tail:-<no log>}"
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
. "${MON:-/opt/monitoring}/lib-alert.sh"

# Disk (root fs) — bad above DISK_BAD_PCT, recovers only below DISK_OK_PCT.
# The gap is deliberate hysteresis: a disk parked exactly on a single threshold
# would otherwise flip state on normal churn (log write, tmp file) and page on
# every flip. Between the two marks we hold whatever state we were already in.
DISK_BAD_PCT=85
DISK_OK_PCT=80
dp=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "${dp:-0}" -gt "$DISK_BAD_PCT" ]; then
  alert_transition disk bad "💾" "DISK ${dp}% on / (>${DISK_BAD_PCT}%)"
elif [ "${dp:-100}" -lt "$DISK_OK_PCT" ]; then
  alert_transition disk ok "" ""
fi

# Memory — bad when available <400MB AND swap >90% (both = real pressure, not
# just healthy cache use / idle pages parked in swap).
# Pull the exact columns by index. The previous `read -r _ _ _ _ _ avail` gave
# six variables for the Mem line's SEVEN fields, so the trailing `avail` absorbed
# both buff/cache AND available ("3490 3283"). Every `[ "$avail" -lt 400 ]` then
# died with "integer expected", the `if` fell through to the else, and the memory
# check silently reported ok on every run since it was written — it could never
# have paged. Positional $N is immune to that whole class.
avail=$(free -m | awk '/^Mem:/{print $7}')
st=$(free -m | awk '/^Swap:/{print $2}')
su=$(free -m | awk '/^Swap:/{print $3}')
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
