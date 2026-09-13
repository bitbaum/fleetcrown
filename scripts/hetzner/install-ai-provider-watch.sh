#!/usr/bin/env bash
#
# Install the model-provider watch: a timer that notices when a provider has
# stopped answering and the fallback chain is quietly carrying the product.
#
# The failure this catches is invisible by construction. On 2026-09-12 Groq
# answered 400 `json_validate_failed` to EVERY structured Cat call — for days —
# and every user still got answers, because OpenRouter picked each one up. The
# health route was green. The only trace was a warn line in a journal nobody
# reads. A chain that degrades gracefully needs something watching the part it
# is gracefully hiding.
#
# Reuses /opt/monitoring/lib-alert.sh (alert_transition fires only on a state
# flip). Detection lives in ai-provider-check.sh, a real file with a real test
# (test-ai-provider-check.sh) whose fixtures are verbatim lines from that
# incident.
#
# Idempotent: re-run to update the checker or the schedule.
#
# Usage:  bash scripts/hetzner/install-ai-provider-watch.sh [user@host]
set -euo pipefail

. "$(dirname "$0")/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
HOST="${1:-$BOX_ROOT}"
MON=/opt/monitoring
SRC="$(dirname "$0")/ai-provider-check.sh"

[ -f "$SRC" ] || { echo "✗ missing $SRC" >&2; exit 1; }

echo "→ ai-provider-watch: installing checker"
scp -q "$SRC" "$HOST:$MON/ai-provider-check.sh"
ssh "$HOST" "chmod 0755 $MON/ai-provider-check.sh"

echo "→ ai-provider-watch: writing unit + timer"
ssh "$HOST" "cat > /etc/systemd/system/fleetcrown-ai-provider.service" <<'UNIT'
[Unit]
Description=FleetCrown: report model providers that keep failing behind the fallback chain
After=network-online.target

[Service]
Type=oneshot
# Root so it can read the app units' journals. It only ever reads and alerts:
# it must never disable a provider on its own. Which link to drop is a product
# decision with cost and quality on both sides, and an automated answer to it
# would be wrong in the direction nobody notices.
ExecStart=/opt/monitoring/ai-provider-check.sh
UNIT

ssh "$HOST" "cat > /etc/systemd/system/fleetcrown-ai-provider.timer" <<'TIMER'
[Unit]
Description=FleetCrown: model-provider failure sweep (daily)

[Timer]
# Daily over a 24h window: this is a "has it been broken for days" watch, not a
# per-request monitor. A provider that fails for an hour is the free tier doing
# its job; one that fails for a day is a bug nobody has noticed.
OnCalendar=daily
RandomizedDelaySec=1800
Persistent=true

[Install]
WantedBy=timers.target
TIMER

echo "→ ai-provider-watch: enabling"
ssh "$HOST" "systemctl daemon-reload && systemctl enable --now fleetcrown-ai-provider.timer && systemctl list-timers fleetcrown-ai-provider --no-pager | tail -2"

echo "→ ai-provider-watch: first run (report only, no alerts)"
ssh "$HOST" "$MON/ai-provider-check.sh --report"

echo "✓ ai-provider-watch installed. Manual check: ssh $HOST $MON/ai-provider-check.sh --report"
