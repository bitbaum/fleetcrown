#!/usr/bin/env bash
# wait-for-vercel.sh — block until the most recent production Vercel deploy
# reaches Ready or Error. Exit 0 on Ready, 1 on Error/Failed/Canceled, 2 on
# timeout, 3 when `vercel` CLI isn't installed.
#
# Why this exists: deploy failures (env-var whitespace, schema drift,
# missing build dep) currently sit in Error state silently until a human
# runs `vercel ls`. This polls the same data on a schedule so a bad push
# fails fast instead of rotting.
#
# Use:
#   bash scripts/wait-for-vercel.sh            # tail the latest deploy
#   bash scripts/wait-for-vercel.sh --quiet    # no status echoes, just exit code
#   npm run ship                               # git push + this script
#
# Env:
#   WAIT_FOR_VERCEL_TIMEOUT  override the 420s deadline
#   WAIT_FOR_VERCEL_INTERVAL override the 12s poll interval

set -u

if ! command -v vercel >/dev/null 2>&1; then
  echo "wait-for-vercel: \`vercel\` CLI not found in PATH" >&2
  exit 3
fi

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

TIMEOUT="${WAIT_FOR_VERCEL_TIMEOUT:-420}"
INTERVAL="${WAIT_FOR_VERCEL_INTERVAL:-12}"
DEADLINE=$(( $(date +%s) + TIMEOUT ))
prev=""

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  # Top deploy row, e.g.: "  5m  orangecat/cockpit  https://...  ● Ready  Production  2m  g-but"
  # Vercel CLI writes the deploy table to STDERR (not stdout) — must merge
  # with 2>&1 to capture. `2>/dev/null` would silently swallow every row.
  row=$(vercel ls --prod 2>&1 | awk '/●/{print; exit}')
  if [ -n "$row" ]; then
    url=$(awk '{print $3}' <<<"$row")
    status=$(awk -F'●' '{print $2}' <<<"$row" | awk '{print $1}')
    msg="$status $url"
    if [ "$msg" != "$prev" ] && [ "$QUIET" -eq 0 ]; then
      echo "wait-for-vercel: $msg"
    fi
    prev="$msg"

    case "$status" in
      Ready)
        [ "$QUIET" -eq 0 ] && echo "wait-for-vercel: ✓ Ready ($url)"
        exit 0
        ;;
      Error|Failed|Canceled)
        echo "wait-for-vercel: ✗ $status — $url" >&2
        echo "  Inspect with: vercel inspect $url --logs" >&2
        exit 1
        ;;
    esac
  fi
  sleep "$INTERVAL"
done

echo "wait-for-vercel: timed out after ${TIMEOUT}s" >&2
exit 2
