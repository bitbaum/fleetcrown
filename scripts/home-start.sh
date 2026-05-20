#!/usr/bin/env bash
# Start the home/ stack — server (Brain) + watcher (Bridge) + worker (Consumer).
# Logs go to /tmp/${APP_SLUG}-home.log so you can tail one file to see all
# three. Ctrl-C kills the whole stack cleanly.
#
# Use:    bash scripts/home-start.sh
#         (UI at http://localhost:3001)
#
# Tail logs in another terminal:
#         tail -f /tmp/${APP_SLUG}-home.log

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_brand.sh
source "$SCRIPT_DIR/_brand.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$(_brand_tmp 'home.log')"
PIDS=()

log() { echo "[home-start] $(date '+%H:%M:%S') $*"; }

# Truncate the log on each restart so old runs don't accumulate.
: > "$LOG_FILE"
log "logs → $LOG_FILE"

# Refuse to start if any port:3001 is already taken — prevents the
# double-launch foot-gun where two server.ts processes silently race on
# the same log file.
if curl -sf --max-time 0.5 http://localhost:3001/api/health >/dev/null 2>&1; then
  log "ERROR: something is already serving localhost:3001 — refusing to start"
  log "       (curl http://localhost:3001/api/health if you want to see what)"
  exit 1
fi

shutdown() {
  log "shutdown requested — stopping ${#PIDS[@]} process(es)"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Give them ~1s to exit gracefully, then SIGKILL the stragglers.
  sleep 1
  for pid in "${PIDS[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  exit 0
}
trap shutdown SIGINT SIGTERM EXIT

cd "$REPO_ROOT"

# Each process tags its output so the merged log is readable when grepped.
launch() {
  local name="$1" cmd="$2"
  ( exec npx tsx "$cmd" 2>&1 | sed -u "s/^/[${name}] /" >> "$LOG_FILE" ) &
  PIDS+=("$!")
  log "started $name (pid $!) → $cmd"
}

launch server  home/server.ts
launch watcher home/watcher.ts
launch worker  home/worker.ts

log "${#PIDS[@]} process(es) running — Ctrl-C to stop"
log "tail -f $LOG_FILE"

# Wait for any child to exit. If one dies, take the whole stack down so the
# user gets a clear signal instead of a half-broken loop.
wait -n
log "a child process exited — taking the stack down"
shutdown
