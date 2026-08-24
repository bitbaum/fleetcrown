#!/usr/bin/env bash
# Nightly-improver start gate (fleetcrown#136).
#
# The improver learns from the run ledger, so it must not be built until the
# ledger has real depth. This checks the documented threshold and pings once
# when it is met — so the trigger comes from the data, not from anyone's
# memory. Self-disables after firing.
#
# Lived on the box as an unversioned /usr/local/bin script until 2026-08-24,
# where it had been failing every night: `set -u` plus an unset
# TELEGRAM_CHAT_ID aborted it at the send. The threshold had ALREADY been met
# (75 metered runs / 26 escalations / 19 days against 25/5/7), so the one
# message it exists to send was the one thing it never did. Codified here so
# it is reviewable and so the next edit is a commit rather than an ssh.
#
# Install: bash scripts/hetzner/install-ledger-ready.sh
set -euo pipefail

STATE=/var/lib/fleetcrown/ledger-ready.done
[ -f "$STATE" ] && exit 0

set -a; . /opt/fleetcrown/app/.env; set +a

read -r METERED ESCALATIONS DAYS <<<"$(LC_ALL=C psql "$DATABASE_URL" -tA -F' ' -c "
  select
    (select count(*) from orchestration_runs where cost_usd is not null),
    (select count(*) from run_escalations),
    (select count(distinct date_trunc('day', created_at)) from orchestration_runs where cost_usd is not null);")"

[ "$METERED" -ge 25 ] && [ "$ESCALATIONS" -ge 5 ] && [ "$DAYS" -ge 7 ] || {
  echo "ledger-ready: not yet (${METERED}/25 metered, ${ESCALATIONS}/5 escalations, ${DAYS}/7 days)"
  exit 0
}

# A missing channel is a REPORTABLE state, not a crash. Under `set -u` the bare
# ${TELEGRAM_CHAT_ID} aborted the unit, so systemd showed `failed` — which
# reads as "the gate is broken" when the truth is "the gate fired and had
# nowhere to send". Distinguish the two, and do NOT stamp the state file:
# nothing was delivered, so the gate must stay armed for the next tick.
if [ -z "${TELEGRAM_CHAT_ID:-}" ] || [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "ledger-ready: THRESHOLD MET (${METERED} metered · ${ESCALATIONS} escalations · ${DAYS} days)" >&2
  echo "ledger-ready: but no Telegram channel is configured (TELEGRAM_CHAT_ID unset) — nothing sent, gate stays armed" >&2
  exit 0
fi

curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d parse_mode=Markdown \
  -d text="*Run ledger is deep enough — build the nightly improver.*
${METERED} metered runs · ${ESCALATIONS} escalations · ${DAYS} days covered.
Spec + start condition: github.com/maonakamoto/fleetcrown/issues/136" >/dev/null

# Only after a delivery actually succeeded (curl -f + set -e) does the gate
# disarm. Stamping before the send is how a one-shot notification becomes a
# notification that never happened.
mkdir -p "$(dirname "$STATE")"
date -Is > "$STATE"
echo "ledger-ready: fired and disarmed"
