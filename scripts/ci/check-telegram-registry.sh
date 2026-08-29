#!/usr/bin/env bash
# Every Telegram sender must be registered in docs/telegram-notifications.md.
#
# The registry is only an SSOT while nothing can ping the phone without being
# in it. This gate finds every sender in the repo — a direct api.telegram.org
# call, an importer of the app's telegram-send.ts, or a box script that
# sources lib-alert.sh — and fails if its path is not listed in the registry.
# The fix is always the same: add the row (or route the send through shared
# machinery that is already registered).
#
# Registered-but-deleted rows are NOT flagged: a row describing an off-repo
# sender (Loki's cron, orangecat's workflow) has no file here by design.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

REGISTRY=docs/telegram-notifications.md
[ -f "$REGISTRY" ] || { echo "✗ $REGISTRY missing — the Telegram registry is gone"; exit 1; }

# Sender surfaces, tracked files only. Tests and installers' test harnesses are
# excluded: they exercise senders, they are not senders.
senders=$(
  {
    git grep -l 'api\.telegram\.org' -- ':!docs/' ':!*test*' ':!*.md' 2>/dev/null || true
    git grep -l 'actions/telegram-send' -- 'src/' ':!src/lib/actions/telegram-send.ts' ':!*test*' 2>/dev/null || true
    git grep -l 'lib-alert\.sh' -- 'scripts/hetzner/' ':!*test*' 2>/dev/null || true
  } | sort -u
)

missing=()
for f in $senders; do
  # uptime-sweep.sh only probes; its ALERTING consumer is fleet-uptime.yml.
  # It still must appear in the registry (it does, as the probe reference) —
  # no special cases: one grep, one rule.
  grep -qF "$f" "$REGISTRY" || missing+=("$f")
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "✗ Telegram sender(s) not registered in $REGISTRY:"
  printf '    %s\n' "${missing[@]}"
  echo "  Every path that can reach the operator's phone must have a row there"
  echo "  (what arrives, when, from where). Add the row in this PR."
  exit 1
fi

n=$(printf '%s\n' "$senders" | grep -c . || true)
echo "✓ telegram registry: all ${n} sender file(s) registered in $REGISTRY"
