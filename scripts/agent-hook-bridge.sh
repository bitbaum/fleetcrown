#!/bin/bash
set -euo pipefail

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "usage: agent-hook-bridge.sh <stop|notification>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/sync-agent-runtime-config.py" >/dev/null 2>&1 || true
# shellcheck source=/dev/null
source "$SCRIPT_DIR/agent-hook-lib.sh"

LOG=/tmp/agent-hooks.log
log() { echo "[$(date '+%H:%M:%S')] ${MODE}: $*" >> "$LOG"; }

beacon_python() {
  local qt_lib="$SCRIPT_DIR/../.python-vendor/site-packages/PyQt6/Qt6/lib"
  local plugin_path="$SCRIPT_DIR/../.python-vendor/site-packages/PyQt6/Qt6/plugins"
  local ld="${LD_LIBRARY_PATH:-}"
  DISPLAY="${DISPLAY:-:1}" \
  DBUS_SESSION_BUS_ADDRESS="$_DBUS" \
  QT_PLUGIN_PATH="$plugin_path" \
  LD_LIBRARY_PATH="${qt_lib}:/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu${ld:+:$ld}" \
  python3 "$SCRIPT_DIR/beacon.py" "$@"
}

patch_project_state() {
  local tab_name="$1"
  local field="$2"
  local iso_now
  iso_now=$(date -Iseconds)
  curl -sf -X PATCH "http://localhost:3000/api/project-states/${tab_name}" \
    -H "Content-Type: application/json" \
    -d "{\"tabName\":\"${tab_name}\",\"${field}\":\"${iso_now}\"}" &>/dev/null &
}

should_skip_native_popup() {
  [ "${AGENT_BRIDGE_FORCE_NATIVE_POPUP:-0}" = "1" ] && return 1
  local settings="$HOME/.config/agent-dashboard-settings.json"
  [ -f "$settings" ] || return 1
  jq -e '.prefer_browser_ready_ui == true' "$settings" >/dev/null 2>&1
}

emit_or_inject_prompt() {
  local tab_name="$1"
  local prompt="$2"
  if [ "${AGENT_BRIDGE_EMIT_PROMPT:-0}" = "1" ]; then
    printf '%s' "$prompt"
  else
    inject_prompt "$tab_name" "$prompt"
  fi
}

handle_stop() {
  find /tmp -maxdepth 1 -name "agent-stop-active-*" -mmin +5 -delete 2>/dev/null
  find /tmp -maxdepth 1 -name "claude-stop-active-*" -mmin +5 -delete 2>/dev/null

  local input cwd label sentinel closed_ts ready_ts choice key base prompt session_file
  input=$(cat)
  cwd=$(echo "$input" | jq -r '.cwd // empty')

  resolve_tab "$cwd"
  label="${TAB_NAME:-$(basename "$cwd")}"
  log "fired — label=$label"
  [ -z "${TAB_NAME:-}" ] && exit 0

  # Guard: skip if a beacon is already active for this tab (rapid turn completions
  # can fire multiple concurrent stop hooks — only the first should show a popup).
  local existing_lock="/tmp/agent-stop-active-${TAB_NAME}"
  [ ! -f "$existing_lock" ] && existing_lock="/tmp/claude-stop-active-${TAB_NAME}"
  if [ -f "$existing_lock" ]; then
    local existing_age
    existing_age=$(( $(date +%s) - $(stat -c %Y "$existing_lock" 2>/dev/null || echo 0) ))
    if [ "$existing_age" -lt 90 ]; then
      log "skipping popup — another stop is active for ${TAB_NAME} (${existing_age}s old)"
      exit 0
    fi
  fi

  rm -f "/tmp/agent-current-prompt-${TAB_NAME}" "/tmp/claude-current-prompt-${TAB_NAME}"

  sentinel="/tmp/agent-session-closed-${TAB_NAME}"
  [ ! -f "$sentinel" ] && sentinel="/tmp/claude-session-closed-${TAB_NAME}"
  if [ -f "$sentinel" ]; then
    log "close-session sentinel found — writing closed file and exiting without popup"
    rm -f "$sentinel"
    closed_ts=$(date +%s)
    echo "$closed_ts" > "/tmp/agent-closed-${TAB_NAME}"
    echo "$closed_ts" > "/tmp/claude-closed-${TAB_NAME}"
    rm -f "/tmp/agent-ready-${TAB_NAME}" "/tmp/claude-ready-${TAB_NAME}"
    rm -f "/tmp/agent-closing-${TAB_NAME}" "/tmp/claude-closing-${TAB_NAME}"
    patch_project_state "$TAB_NAME" "closedAt"
    exit 0
  fi

  rm -f "/tmp/agent-closing-${TAB_NAME}" "/tmp/agent-closed-${TAB_NAME}"
  rm -f "/tmp/claude-closing-${TAB_NAME}" "/tmp/claude-closed-${TAB_NAME}"

  ready_ts=$(date +%s)
  echo "$ready_ts" > "/tmp/agent-ready-${TAB_NAME}"
  echo "$ready_ts" > "/tmp/claude-ready-${TAB_NAME}"
  patch_project_state "$TAB_NAME" "readyAt"

  play_sound "complete"

  # Ensure the screen-position sentinel exists so beacon.py knows which monitor to
  # appear on. The claude() bash wrapper writes this at launch, but context-limit
  # continuations (started with ! or --continue) bypass the wrapper and miss it.
  # Write primary monitor geometry as a safe fallback — no cursor dependency.
  if [ -n "${ZELLIJ_PANE_ID:-}" ] && [ ! -f "/tmp/claude-screen-${ZELLIJ_PANE_ID}" ]; then
    _primary_geo=$(xrandr --query 2>/dev/null \
      | awk '/ connected primary / {
          for (i=1;i<=NF;i++) {
            if ($i ~ /^[0-9]+x[0-9]+\+[0-9]+\+[0-9]+$/) {
              n=split($i,a,/[x+]/);
              if(n==4) print a[3]","a[4]","a[1]","a[2];
              break
            }
          }
          exit
        }')
    [ -n "$_primary_geo" ] && printf '%s\n' "$_primary_geo" > "/tmp/claude-screen-${ZELLIJ_PANE_ID}"
  fi

  if should_skip_native_popup && curl -sf --max-time 2 "http://localhost:3000/api/health" >/dev/null 2>&1; then
    log "Cockpit running — skipping native popup"
    exit 0
  fi

  local lock="/tmp/agent-stop-active-${TAB_NAME}"
  touch "$lock" "/tmp/claude-stop-active-${TAB_NAME}"
  trap "rm -f '$lock' /tmp/claude-stop-active-${TAB_NAME}" EXIT

  session_file="$HOME/.claude/sessions/${TAB_NAME}.md"
  if ! choice=$(beacon_python stop "$label" "$session_file" 2>>"$LOG"); then
    log "native popup failed — falling back to slot 1 auto-continue"
    choice="1"
  fi
  log "popup choice=$choice"
  [ -z "$choice" ] && exit 0

  local inject_key inject_label
  if [[ "$choice" == custom:* ]]; then
    prompt="${choice#custom:}"
    inject_key="custom"
    inject_label="${choice#custom:}"
  else
    key=$(jq -r --argjson slot "$choice" '.[] | select(.slot == $slot) | .key' "$_PROMPTS" 2>/dev/null)
    [ -z "$key" ] && log "no key for slot=$choice" && exit 0

    base=$(get_prompt "$key")
    [ -z "$base" ] && log "prompt not found for key=$key" && exit 0

    inject_key="$key"
    inject_label=$(jq -r --argjson slot "$choice" '.[] | select(.slot == $slot) | (.icon + " " + .label)' "$_PROMPTS" 2>/dev/null | head -1)
    [ -z "$inject_label" ] && inject_label="$key"

    if [ "$key" = "close_session" ]; then
      touch "/tmp/agent-session-closed-${TAB_NAME}"
      echo "$(date +%s)" > "/tmp/agent-closing-${TAB_NAME}"
      rm -f "/tmp/agent-ready-${TAB_NAME}"
      patch_project_state "$TAB_NAME" "closingAt"
    fi

    if [ -f "$session_file" ]; then
      local session
      session=$(cat "$session_file")
      prompt=$(printf '%s\n\nSession state from last run:\n%s\n\nUpdate %s when done: what you completed and what remains.' \
        "$base" "$session" "$session_file")
    else
      prompt=$(printf '%s\n\nBefore stopping, create %s with two lines: "done: <what you completed>" and "next: <what remains>".' \
        "$base" "$session_file")
    fi
  fi

  emit_or_inject_prompt "$TAB_NAME" "$prompt"

  # Sync state so Control panel and web beacon reflect the running task immediately.
  # Without this, the UI shows "waiting for input" until the next Claude stop hook fires.
  write_inject_state "$TAB_NAME" "$inject_key" "$inject_label"
  log "injected key=$inject_key label=$inject_label"
}

handle_notification() {
  local input cwd lock age sentinel closing closed prompt
  input=$(cat)
  cwd=$(echo "$input" | jq -r '.cwd // empty')

  resolve_tab "$cwd"
  [ -z "${TAB_NAME:-}" ] && exit 0

  lock="/tmp/agent-stop-active-${TAB_NAME}"
  [ ! -f "$lock" ] && lock="/tmp/claude-stop-active-${TAB_NAME}"
  if [ -f "$lock" ]; then
    age=$(( $(date +%s) - $(stat -c %Y "$lock" 2>/dev/null || echo 0) ))
    if [ "$age" -lt 300 ]; then
      exit 0
    fi
    rm -f "$lock"
  fi

  sentinel="/tmp/agent-session-closed-${TAB_NAME}"
  [ ! -f "$sentinel" ] && sentinel="/tmp/claude-session-closed-${TAB_NAME}"
  closing="/tmp/agent-closing-${TAB_NAME}"
  [ ! -f "$closing" ] && closing="/tmp/claude-closing-${TAB_NAME}"
  closed="/tmp/agent-closed-${TAB_NAME}"
  [ ! -f "$closed" ] && closed="/tmp/claude-closed-${TAB_NAME}"

  [ -f "$sentinel" ] && exit 0
  [ -f "$closing" ] && exit 0
  [ -f "$closed" ] && exit 0

  play_sound "window-attention"

  prompt=$(get_prompt "continue")
  [ -z "$prompt" ] && exit 0

  inject_prompt "$TAB_NAME" "$prompt"
}

case "$MODE" in
  stop) handle_stop ;;
  notification) handle_notification ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac
