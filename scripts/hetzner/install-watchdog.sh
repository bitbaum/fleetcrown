#!/usr/bin/env bash
# install-watchdog.sh — box-wide uptime + health watchdog for the bitbaum box.
#
# WHY separate from install-hetzner-crons.sh / install-backups.sh: this watches
# EVERY app on the box (FleetCrown, OrangeCat + the apps.conf apps) and the
# FleetCrown auth/email health signals, so it's box-wide infra and lives here
# next to sync-infra.sh / verify.sh / install-backups.sh.
#
# What it installs on the box (167.233.22.31):
#   /opt/monitoring/watch.sh                  the check runner
#   /opt/monitoring/targets.conf              label|url|expected_code (seeded from apps.conf)
#   /etc/systemd/system/watchdog.{service,timer}   runs every 5 minutes
#   /opt/monitoring/state/                     per-target up/down state (transition detection)
#
# Alerting is transition-only (alerts on up→down and down→up, never every tick).
# It activates the moment /opt/monitoring/telegram.env exists with a bot token —
# until then it logs to the journal (journalctl -t watchdog). Same drop-in
# pattern as backups' restic.env.
#
# WHAT THIS CANNOT DO: it runs ON the box, so it cannot report the box being
# entirely down/unreachable. For that, set HEARTBEAT_URL in telegram.env to a
# dead-man's-switch (e.g. a free healthchecks.io ping) — the watchdog pings it
# each run, and that external service alerts if the pings stop. See the notes
# printed at the end.
#
# Idempotent — safe to re-run (re-seeds targets.conf from apps.conf each time).
# Usage: bash scripts/hetzner/install-watchdog.sh

set -euo pipefail

HOST="root@${HETZNER_IP:-167.233.22.31}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_CONF="$SCRIPT_DIR/apps.conf"

# ── Build the target list (SSOT-derived) ────────────────────────────────────
# FleetCrown health is first — a 503 there means the env guardrail found a
# fatal/error config issue, so this check doubles as a config-rot alarm.
TARGETS="fleetcrown-health|https://fleetcrown.orangecat.ch/api/health|200
fleetcrown|https://fleetcrown.orangecat.ch/sign-in|200
orangecat|https://orangecat.ch|200"

# Append every public domain from apps.conf (field 3, comma-sep, '-' = internal).
if [ -f "$APPS_CONF" ]; then
  while IFS='|' read -r name port domains rest; do
    case "$name" in ''|\#*) continue;; esac
    [ "$domains" = "-" ] && continue
    IFS=',' read -ra DOMS <<< "$domains"
    for d in "${DOMS[@]}"; do
      [ -z "$d" ] && continue
      TARGETS="${TARGETS}
${name}|https://${d}|200"
    done
  done < "$APPS_CONF"
fi

echo "→ seeding $(printf '%s\n' "$TARGETS" | grep -c '|') monitoring targets"

# ── Install on the box ──────────────────────────────────────────────────────
ssh -o BatchMode=yes "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
mkdir -p /opt/monitoring/state

cat > /opt/monitoring/watch.sh <<'SH'
#!/usr/bin/env bash
# Box watchdog — checks each target in targets.conf, alerts on state TRANSITIONS
# only (not every tick). Alert channel: Telegram if /opt/monitoring/telegram.env
# provides a token, else the systemd journal (journalctl -t watchdog).
set -uo pipefail
MON=/opt/monitoring
STATE="$MON/state"
mkdir -p "$STATE"
[ -f "$MON/telegram.env" ] && . "$MON/telegram.env" || true

alert() {  # $1=emoji $2=message
  local text="$1 $2"
  logger -t watchdog "$text"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${text}" -o /dev/null \
      || logger -t watchdog "ALERT telegram send failed"
  fi
}

check() {  # label url   (targets.conf 3rd field is ignored — redirects are followed)
  local label="$1" url="$2"
  local sf="$STATE/$(printf '%s' "$label" | tr -c 'a-zA-Z0-9' '_')"
  local code
  # Follow redirects (-L): a 3xx root (locale/trailing-slash) is the server
  # responding, not an outage. UP on a 2xx/3xx final status; DOWN on unreachable
  # (000) or a 4xx/5xx error — incl. fleetcrown /api/health returning 503 when
  # the env guardrail finds a config issue.
  code=$(curl -sL -o /dev/null -m 15 -w "%{http_code}" "$url" 2>/dev/null || echo 000)
  local now="up"; { [ "$code" = "000" ] || [ "$code" -ge 400 ] 2>/dev/null; } && now="down"
  local prev="up"; [ -f "$sf" ] && prev=$(cat "$sf")
  if [ "$now" != "$prev" ]; then
    if [ "$now" = "down" ]; then
      alert "🔴" "DOWN: ${label} (${url}) → HTTP ${code}"
    else
      alert "✅" "RECOVERED: ${label} (${url})"
    fi
    printf '%s' "$now" > "$sf"
  fi
}

while IFS='|' read -r label url want; do
  case "$label" in ''|\#*) continue;; esac
  check "$label" "$url"
done < "$MON/targets.conf"

# Dead-man's-switch: ping an external heartbeat so box-death is caught off-box.
if [ -n "${HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 "$HEARTBEAT_URL" -o /dev/null || logger -t watchdog "heartbeat ping failed"
fi
SH
chmod +x /opt/monitoring/watch.sh

cat > /etc/systemd/system/watchdog.service <<'SVC'
[Unit]
Description=Box uptime/health watchdog
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/monitoring/watch.sh
SVC

cat > /etc/systemd/system/watchdog.timer <<'TIMER'
[Unit]
Description=Run the box watchdog every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true
Unit=watchdog.service

[Install]
WantedBy=timers.target
TIMER

# telegram.env template (only if absent — never clobber a real token).
if [ ! -f /opt/monitoring/telegram.env ]; then
  cat > /opt/monitoring/telegram.env <<'ENVT'
# Drop your bot token + chat id here to activate Telegram alerts.
# TELEGRAM_BOT_TOKEN=123456:ABC...
# TELEGRAM_CHAT_ID=987654321
# Optional dead-man's-switch (catches box-death off-box), e.g. healthchecks.io:
# HEARTBEAT_URL=https://hc-ping.com/your-uuid
ENVT
  chmod 600 /opt/monitoring/telegram.env
fi

systemctl daemon-reload
systemctl enable --now watchdog.timer >/dev/null 2>&1
echo "✓ watchdog.timer installed:"
systemctl list-timers watchdog.timer --no-pager | grep -E 'watchdog|NEXT' || true
REMOTE

# Ship the freshly-built target list (the heredoc above is static; targets are
# data, written separately so a re-run refreshes them from apps.conf).
printf '%s\n' "$TARGETS" | ssh -o BatchMode=yes "$HOST" 'cat > /opt/monitoring/targets.conf'
echo "✓ wrote /opt/monitoring/targets.conf"

# Prime state + show the first read (currently-down targets alert on next tick).
ssh -o BatchMode=yes "$HOST" '/opt/monitoring/watch.sh; echo "→ first watchdog pass done (journalctl -t watchdog for any alerts)"'

cat <<'NOTE'

── To activate alerts ─────────────────────────────────────────────────────────
1. Create a Telegram bot: message @BotFather → /newbot → copy the token.
2. Get your chat id: message your new bot once, then open
     https://api.telegram.org/bot<TOKEN>/getUpdates  and read chat.id
3. On the box: edit /opt/monitoring/telegram.env with TELEGRAM_BOT_TOKEN +
   TELEGRAM_CHAT_ID (and optionally HEARTBEAT_URL for box-death detection).
Until then, alerts are written to the journal: journalctl -t watchdog -f
NOTE
