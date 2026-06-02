#!/usr/bin/env bash
# Wait for ORACLE_HOST in migration config, then run cutover automatically.
# Start before creating the VM in Oracle Console; cutover fires when IP is set.
#
# Usage:
#   ./scripts/db/oracle-await-cutover.sh &
#   # create VM, then:
#   sed -i 's/^ORACLE_HOST=.*/ORACLE_HOST=1.2.3.4/' ~/.config/fleetcrown/oracle-migration.env

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG="${COCKPIT_ORACLE_CONFIG:-${HOME}/.config/fleetcrown/oracle-migration.env}"
LOG="${HOME}/.config/fleetcrown/oracle-await.log"
TIMEOUT="${ORACLE_AWAIT_TIMEOUT:-7200}"
INTERVAL=15

mkdir -p "$(dirname "$LOG")"
echo "[$(date -Iseconds)] Waiting for ORACLE_HOST in $CONFIG (timeout ${TIMEOUT}s)" | tee -a "$LOG"

deadline=$((SECONDS + TIMEOUT))
host=""

while [ "$SECONDS" -lt "$deadline" ]; do
  if [ -f "$CONFIG" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG"
    host="${ORACLE_HOST:-}"
    if [ -n "$host" ]; then
      echo "[$(date -Iseconds)] ORACLE_HOST=$host — starting cutover" | tee -a "$LOG"
      cd "$ROOT"
      ORACLE_HOST="$host" SKIP_DUMP="${SKIP_DUMP:-1}" bash scripts/db/oracle-cutover.sh 2>&1 | tee -a "$LOG"
      exit $?
    fi
  fi
  sleep "$INTERVAL"
done

echo "[$(date -Iseconds)] Timed out waiting for ORACLE_HOST" | tee -a "$LOG"
exit 1
