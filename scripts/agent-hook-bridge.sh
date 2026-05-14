#!/bin/bash
set -euo pipefail

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "usage: agent-hook-bridge.sh <stop|notification>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Wire-format prefix for custom prompts — must match CUSTOM_CHOICE_PREFIX in src/lib/constants/control.ts
readonly CUSTOM_CHOICE_PREFIX="custom:"
readonly SWITCH_CHOICE_PREFIX="switch:"
# Override via COCKPIT_URL env var for non-default ports or remote deployments.
readonly COCKPIT_URL="${COCKPIT_URL:-http://localhost:3000}"
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
  curl -sf -X PATCH "${COCKPIT_URL}/api/project-states/${tab_name}" \
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

agent_command() {
  local agent="$1" dir="$2"
  case "$agent" in
    claude) printf "source ~/.bashrc >/dev/null 2>&1 || true; cd %q && claude" "$dir" ;;
    codex) printf "source ~/.bashrc >/dev/null 2>&1 || true; cd %q && codex --model gpt-5.4 --no-alt-screen" "$dir" ;;
    gemini) printf "source ~/.bashrc >/dev/null 2>&1 || true; cd %q && gemini" "$dir" ;;
    *) return 1 ;;
  esac
}

switch_agent_and_continue() {
  local tab_name="$1" project_dir="$2" agent="$3" prompt="$4"
  local command prompt_file runner

  case "$agent" in
    codex|gemini)
      prompt_file="/tmp/cockpit-${agent}-prompt-$(date +%s)-$$.txt"
      printf '%s' "$prompt" > "$prompt_file"
      runner="$SCRIPT_DIR/run-${agent}-task.sh"
      command=$(printf "bash %q %q %q %q %q" "$runner" "$tab_name" "$project_dir" "$prompt_file" "$([ "$agent" = "gemini" ] && echo auto || echo gpt-5.4)")
      zellij action go-to-tab-name "$tab_name" 2>/dev/null || true
      sleep 0.2
      zellij action write 3 2>/dev/null || true
      sleep 0.1
      zellij action write-chars -- "$command" 2>/dev/null || true
      sleep 0.1
      zellij action write 13 2>/dev/null || true
      ;;
    claude)
      command=$(agent_command "$agent" "$project_dir") || return 1
      zellij action go-to-tab-name "$tab_name" 2>/dev/null || true
      sleep 0.2
      zellij action write 3 2>/dev/null || true
      sleep 0.1
      zellij action write-chars -- "$command" 2>/dev/null || true
      sleep 0.1
      zellij action write 13 2>/dev/null || true
      sleep 3
      inject_prompt "$tab_name" "$prompt"
      ;;
    *)
      return 1
      ;;
  esac
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

  # Atomically claim the stop-active lock using noclobber so concurrent stop hooks
  # can't both pass the check. A plain test-then-write is a TOCTOU race in bash.
  local lock="/tmp/agent-stop-active-${TAB_NAME}"
  if ! ( set -C; : > "$lock" ) 2>/dev/null; then
    # File exists — skip if recent, overwrite if stale (crashed process left it behind).
    local existing_age
    existing_age=$(( $(date +%s) - $(stat -c %Y "$lock" 2>/dev/null || echo 0) ))
    if [ "$existing_age" -lt 90 ]; then
      log "skipping popup — another stop is active for ${TAB_NAME} (${existing_age}s old)"
      exit 0
    fi
    : > "$lock"  # stale — overwrite
  fi
  trap "rm -f '$lock'" EXIT

  rm -f "/tmp/agent-current-prompt-${TAB_NAME}" "/tmp/claude-current-prompt-${TAB_NAME}"

  sentinel="/tmp/agent-session-closed-${TAB_NAME}"
  if [ -f "$sentinel" ]; then
    log "close-session sentinel found — writing closed file and exiting without popup"
    rm -f "$sentinel"
    closed_ts=$(date +%s)
    echo "$closed_ts" > "/tmp/agent-closed-${TAB_NAME}"
    rm -f "/tmp/agent-ready-${TAB_NAME}" "/tmp/claude-ready-${TAB_NAME}"
    rm -f "/tmp/agent-closing-${TAB_NAME}" "/tmp/claude-closing-${TAB_NAME}"
    patch_project_state "$TAB_NAME" "closedAt"
    exit 0
  fi

  rm -f "/tmp/agent-closing-${TAB_NAME}" "/tmp/agent-closed-${TAB_NAME}"
  rm -f "/tmp/claude-closing-${TAB_NAME}" "/tmp/claude-closed-${TAB_NAME}"

  ready_ts=$(date +%s)
  echo "$ready_ts" > "/tmp/agent-ready-${TAB_NAME}"
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

  if should_skip_native_popup && curl -sf --max-time 2 "${COCKPIT_URL}/api/health" >/dev/null 2>&1; then
    log "Cockpit running — skipping native popup"
    exit 0
  fi

  session_file="$HOME/.claude/sessions/${TAB_NAME}.md"
  if ! choice=$(beacon_python stop "$label" "$session_file" 2>>"$LOG"); then
    log "native popup failed — falling back to slot 1 auto-continue"
    choice="1"
  fi
  log "popup choice=$choice"
  [ -z "$choice" ] && exit 0

  local inject_key inject_label queue_file
  queue_file="/tmp/agent-queue-${TAB_NAME,,}"

  # If choice is '1' (Next Best Task), check if there's a queue item and fire that instead.
  # This matches the web beacon logic and handles the race where PyQt hits 0s first.
  if [ "$choice" = "1" ] && [ -f "$queue_file" ]; then
    local first_item
    first_item=$(jq -r '.[0] // empty' "$queue_file" 2>/dev/null)
    if [ -n "$first_item" ]; then
      log "prioritizing queue item over slot 1 choice"
      choice="${CUSTOM_CHOICE_PREFIX}${first_item}"
      # Remove it from the file to avoid double-firing from the web app
      local tmp_q="${queue_file}.tmp"
      jq 'del(.[0])' "$queue_file" > "$tmp_q" 2>/dev/null && mv "$tmp_q" "$queue_file"
    fi
  fi

  if [[ "$choice" == "${SWITCH_CHOICE_PREFIX}"* ]]; then
    local target_agent switch_prompt switch_label first_item tmp_q session_update_block session
    target_agent="${choice#"${SWITCH_CHOICE_PREFIX}"}"
    case "$target_agent" in
      claude|codex|gemini) ;;
      *) log "unknown switch target=$target_agent" && exit 0 ;;
    esac

    switch_label="Switch to ${target_agent}"
    if [ -f "$queue_file" ]; then
      first_item=$(jq -r '.[0] // empty' "$queue_file" 2>/dev/null)
      if [ -n "$first_item" ]; then
        switch_prompt="$first_item"
        tmp_q="${queue_file}.tmp"
        jq 'del(.[0])' "$queue_file" > "$tmp_q" 2>/dev/null && mv "$tmp_q" "$queue_file"
        switch_label="Switch to ${target_agent} · queued prompt"
      fi
    fi

    if [ -z "${switch_prompt:-}" ]; then
      base=$(get_prompt "next_best")
      [ -z "$base" ] && log "prompt not found for key=next_best" && exit 0

      session_update_block="When done, update ${session_file} with exactly these lines:
done: <one sentence what you completed>
next: <one sentence what remains>
tests: <N pass · N fail, or 'no suite'>
todos: <count> TODOs
health: <good | needs attention | critical>"

      if [ -f "$session_file" ]; then
        session=$(cat "$session_file")
        switch_prompt="${base}

Session state from last run:
${session}

${session_update_block}"
      else
        switch_prompt="${base}

Before stopping, create ${session_file}.
${session_update_block}"
      fi
    fi

    switch_agent_and_continue "$TAB_NAME" "$cwd" "$target_agent" "$switch_prompt"
    write_inject_state "$TAB_NAME" "switch_agent" "$switch_label"
    log "switched target=$target_agent"
    exit 0
  elif [[ "$choice" == "${CUSTOM_CHOICE_PREFIX}"* ]]; then
    prompt="${choice#"${CUSTOM_CHOICE_PREFIX}"}"
    inject_key="custom"
    inject_label="${choice#"${CUSTOM_CHOICE_PREFIX}"}"
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

    local session_update_block
    session_update_block="When done, update ${session_file} with exactly these lines:
done: <one sentence what you completed>
next: <one sentence what remains>
tests: <N pass · N fail, or 'no suite'>
todos: <count> TODOs
health: <good | needs attention | critical>"

    if [ -f "$session_file" ]; then
      local session
      session=$(cat "$session_file")
      prompt="${base}

Session state from last run:
${session}

${session_update_block}"
    else
      prompt="${base}

Before stopping, create ${session_file}.
${session_update_block}"
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
  if [ -f "$lock" ]; then
    age=$(( $(date +%s) - $(stat -c %Y "$lock" 2>/dev/null || echo 0) ))
    if [ "$age" -lt 300 ]; then
      exit 0
    fi
    rm -f "$lock"
  fi

  [ -f "/tmp/agent-session-closed-${TAB_NAME}" ] && exit 0
  [ -f "/tmp/agent-closing-${TAB_NAME}" ] && exit 0
  [ -f "/tmp/agent-closed-${TAB_NAME}" ] && exit 0

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
