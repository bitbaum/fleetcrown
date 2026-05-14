#!/usr/bin/env bash
# cockpit-daemon.sh — polls the cloud control plane for pending commands and executes them locally.
#
# Usage:
#   COCKPIT_DAEMON_TOKEN=<secret> COCKPIT_DAEMON_USER_ID=<uuid> ./scripts/cockpit-daemon.sh
#
# Optional env vars:
#   COCKPIT_BASE_URL      — defaults to https://cockpit-lmr3cq7mx-orangecat.vercel.app
#   COCKPIT_POLL_INTERVAL — seconds between polls, default 5
#   COCKPIT_DRY_RUN       — set to "1" to log commands without executing them
#
# The daemon authenticates to the remote API using the bearer token, claims the next
# pending command, executes it via zellij (inject_prompt / focus-tab), and marks it done.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared zellij helpers (inject_prompt, etc.)
# shellcheck source=agent-hook-lib.sh
source "$SCRIPT_DIR/agent-hook-lib.sh" 2>/dev/null || {
  echo "[daemon] ERROR: cannot source agent-hook-lib.sh" >&2
  exit 1
}

BASE_URL="${COCKPIT_BASE_URL:-https://cockpit-lmr3cq7mx-orangecat.vercel.app}"
POLL_INTERVAL="${COCKPIT_POLL_INTERVAL:-5}"
DRY_RUN="${COCKPIT_DRY_RUN:-0}"
TOKEN="${COCKPIT_DAEMON_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "[daemon] ERROR: COCKPIT_DAEMON_TOKEN is not set" >&2
  exit 1
fi

log() { echo "[daemon] $(date '+%H:%M:%S') $*"; }

claim_next() {
  curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/control/commands" 2>/dev/null
}

mark_done() {
  local id="$1" ok="$2" err="${3:-}"
  local body
  if [ -n "$err" ]; then
    body=$(printf '{"ok":%s,"error":%s}' "$ok" "$(printf '%s' "$err" | jq -Rs .)")
  else
    body=$(printf '{"ok":%s}' "$ok")
  fi
  curl -sf -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$BASE_URL/api/control/commands/$id" >/dev/null 2>&1 || true
}

execute_inject() {
  local id="$1" tab="$2" prompt="$3"
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN inject → tab=$tab prompt=${prompt:0:60}"
    mark_done "$id" "true"
    return 0
  fi

  log "inject → tab=$tab"
  if inject_prompt "$tab" "$prompt" 2>/dev/null; then
    mark_done "$id" "true"
    log "inject done ✓"
  else
    mark_done "$id" "false" "inject_prompt failed"
    log "inject failed ✗"
  fi
}

execute_focus_tab() {
  local id="$1" tab="$2"
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN focus_tab → $tab"
    mark_done "$id" "true"
    return 0
  fi

  log "focus_tab → $tab"
  if zellij action go-to-tab-name "$tab" 2>/dev/null; then
    mark_done "$id" "true"
    log "focus_tab done ✓"
  else
    mark_done "$id" "false" "go-to-tab-name failed"
    log "focus_tab failed ✗"
  fi
}

log "starting — polling $BASE_URL every ${POLL_INTERVAL}s"

while true; do
  response=$(claim_next) || { sleep "$POLL_INTERVAL"; continue; }

  command_json=$(echo "$response" | jq -c '.command // empty' 2>/dev/null)
  [ -z "$command_json" ] && { sleep "$POLL_INTERVAL"; continue; }

  id=$(echo "$command_json" | jq -r '.id')
  type=$(echo "$command_json" | jq -r '.type')
  payload=$(echo "$command_json" | jq -c '.payload')

  case "$type" in
    inject)
      tab=$(echo "$payload" | jq -r '.tab')
      prompt=$(echo "$payload" | jq -r '.prompt')
      execute_inject "$id" "$tab" "$prompt"
      ;;
    focus_tab)
      tab=$(echo "$payload" | jq -r '.tab')
      execute_focus_tab "$id" "$tab"
      ;;
    *)
      log "unknown command type: $type — marking done"
      mark_done "$id" "false" "unknown type: $type"
      ;;
  esac

  # Poll immediately for any queued follow-ups, then wait.
  sleep 1
done
