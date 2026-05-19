#!/bin/bash
set -euo pipefail

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "usage: agent-hook-bridge.sh <stop|notification>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Wire-format prefixes — must match CUSTOM_CHOICE_PREFIX / SWITCH_CHOICE_PREFIX in src/lib/constants/control.ts
readonly CUSTOM_CHOICE_PREFIX="custom:"
readonly SWITCH_CHOICE_PREFIX="switch:"
# Override via COCKPIT_URL env var for non-default ports or remote deployments.
readonly COCKPIT_URL="${COCKPIT_URL:-http://localhost:3000}"
python3 "$SCRIPT_DIR/sync-agent-runtime-config.py" >/dev/null 2>&1 || true
# shellcheck source=/dev/null
source "$SCRIPT_DIR/agent-hook-lib.sh"

LOG=/tmp/agent-hooks.log
log() { echo "[$(date '+%H:%M:%S')] ${MODE}: $*" >> "$LOG"; }

# Read per-user beacon settings from the Cockpit API (uses daemon token for auth).
# Falls back to Python file reader when Cockpit is offline.
_BEACON_TOKEN="${COCKPIT_DAEMON_TOKEN:-$(grep -m1 '^COCKPIT_DAEMON_TOKEN=' "$SCRIPT_DIR/../.env.local" 2>/dev/null | cut -d= -f2-)}"
_BEACON_SETTINGS_JSON=""
if [ -n "$_BEACON_TOKEN" ]; then
  _BEACON_SETTINGS_JSON=$(curl -sf --max-time 2 \
    -H "Authorization: Bearer ${_BEACON_TOKEN}" \
    "${COCKPIT_URL}/api/beacon-settings" 2>/dev/null || true)
fi

if [ -n "$_BEACON_SETTINGS_JSON" ]; then
  _BEACON_MIN_IDLE=$(printf '%s' "$_BEACON_SETTINGS_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('min_idle_seconds',0))" 2>/dev/null || echo 0)
  _BEACON_POPUP_MODE=$(printf '%s' "$_BEACON_SETTINGS_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('popup_mode','both'))" 2>/dev/null || echo both)
else
  # Cockpit offline — read from Python config (which reads the legacy file)
  _BEACON_MIN_IDLE=$(python3 -c "
import sys; sys.path.insert(0, '$SCRIPT_DIR')
from _beacon_config import get_min_idle_seconds
print(get_min_idle_seconds())
" 2>/dev/null || echo 0)
  _BEACON_POPUP_MODE=$(python3 -c "
import sys; sys.path.insert(0, '$SCRIPT_DIR')
from _beacon_config import get_popup_mode
print(get_popup_mode())
" 2>/dev/null || echo both)
fi
export BEACON_POPUP_MODE="$_BEACON_POPUP_MODE"

beacon_launch() {
  DISPLAY="${DISPLAY:-:1}" DBUS_SESSION_BUS_ADDRESS="$_DBUS" \
    python3 "$SCRIPT_DIR/beacon.py" "$@"
}

patch_project_state() {
  local tab_name="$1"
  local field="$2"
  local iso_now token
  iso_now=$(date -Iseconds)
  token="${COCKPIT_DAEMON_TOKEN:-$(grep -m1 '^COCKPIT_DAEMON_TOKEN=' "$SCRIPT_DIR/../.env.local" 2>/dev/null | cut -d= -f2-)}"
  curl -sf -X PATCH "${COCKPIT_URL}/api/project-states/${tab_name}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d "{\"tabName\":\"${tab_name}\",\"${field}\":\"${iso_now}\"}" &>/dev/null &
}

# Finishes an orchestration_runs row with the captured handoff so dispatch
# can learn from outcomes. The run id was written to /tmp/cockpit-run-<tab>
# at dispatch time. Fire-and-forget — never blocks the stop hook.
finish_orchestration_run() {
  local tab_name="$1"
  local session_file="$2"
  local run_sentinel="/tmp/cockpit-run-${tab_name}"
  [ -f "$run_sentinel" ] || return 0
  local run_id token done_line next_line tests_line todos_line health_line
  run_id=$(cat "$run_sentinel" 2>/dev/null | tr -d '[:space:]')
  [ -z "$run_id" ] && return 0
  token="${COCKPIT_DAEMON_TOKEN:-$(grep -m1 '^COCKPIT_DAEMON_TOKEN=' "$SCRIPT_DIR/../.env.local" 2>/dev/null | cut -d= -f2-)}"
  done_line=""; next_line=""; tests_line=""; todos_line=""; health_line=""
  if [ -f "$session_file" ]; then
    done_line=$(grep -m1 '^done:'   "$session_file" 2>/dev/null | sed 's/^done:[[:space:]]*//')
    next_line=$(grep -m1 '^next:'   "$session_file" 2>/dev/null | sed 's/^next:[[:space:]]*//')
    tests_line=$(grep -m1 '^tests:' "$session_file" 2>/dev/null | sed 's/^tests:[[:space:]]*//')
    todos_line=$(grep -m1 '^todos:' "$session_file" 2>/dev/null | sed 's/^todos:[[:space:]]*//')
    health_line=$(grep -m1 '^health:' "$session_file" 2>/dev/null | sed 's/^health:[[:space:]]*//')
  fi
  local payload
  payload=$(jq -n \
    --arg d "$done_line" --arg n "$next_line" --arg t "$tests_line" \
    --arg td "$todos_line" --arg h "$health_line" \
    '{summary: {done: $d, next: $n, tests: $t, todos: $td, health: $h}}')
  curl -sf -X POST "${COCKPIT_URL}/api/orchestration/runs/${run_id}/finish" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}" \
    -d "$payload" &>/dev/null &
  rm -f "$run_sentinel"
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

  # Interrupt any lingering process at the prompt. send_raw_key_to_tab handles
  # session discovery and waits for tab focus before sending the keycode.
  send_raw_key_to_tab "$tab_name" 3 2>/dev/null || true
  sleep 0.3

  case "$agent" in
    codex|gemini)
      prompt_file="/tmp/cockpit-${agent}-prompt-$(date +%s)-$$.txt"
      printf '%s' "$prompt" > "$prompt_file"
      runner="$SCRIPT_DIR/run-${agent}-task.sh"
      command=$(printf "bash %q %q %q %q %q" "$runner" "$tab_name" "$project_dir" "$prompt_file" "$([ "$agent" = "gemini" ] && echo auto || echo gpt-5.4)")
      inject_prompt "$tab_name" "$command" 2>/dev/null || true
      ;;
    claude)
      command=$(agent_command "$agent" "$project_dir") || return 1
      inject_prompt "$tab_name" "$command" 2>/dev/null || true
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
  # Close out the tracked orchestration run with the handoff from the session
  # file the agent just wrote. Done before the popup so the next dispatch can
  # see this outcome via getRecentOutcomes() if Cockpit fetches mid-popup.
  finish_orchestration_run "$TAB_NAME" "$HOME/.claude/sessions/${TAB_NAME}.md"

  play_sound "complete"

  # Skip beacon when user is actively at keyboard.  Uses XScreenSaver idle time via
  # libXss (or xprintidle if installed).  Returns 9999 when no idle source is available,
  # which causes the beacon to show as a safe fallback.  Install xprintidle for this gate
  # to work on systems without the MIT-SCREEN-SAVER X11 extension.
  _idle_secs=$(
    if command -v xprintidle >/dev/null 2>&1; then
      ms=$(DISPLAY="${DISPLAY:-:0}" xprintidle 2>/dev/null || echo 99999999)
      echo $(( ms / 1000 ))
    else
      DISPLAY="${DISPLAY:-:0}" python3 "$SCRIPT_DIR/get-idle-secs.py" 2>/dev/null || echo 9999
    fi
  )
  if [ "${_BEACON_POPUP_MODE:-both}" = "disabled" ]; then
    log "beacon disabled by user settings — skipping popup"
    exit 0
  fi
  if [ "${_BEACON_MIN_IDLE:-0}" -gt 0 ] && [ "${_idle_secs:-9999}" -lt "$_BEACON_MIN_IDLE" ]; then
    log "user active (idle=${_idle_secs}s < ${_BEACON_MIN_IDLE}s) — skipping beacon"
    exit 0
  fi

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


  session_file="$HOME/.claude/sessions/${TAB_NAME}.md"

  # Two-layer race — both run in parallel; first choice wins.
  #
  # Layer 1 (< 100 ms): OS notification with KDE action buttons.
  #   notify-choice.py shows a native notification immediately.  When the user
  #   clicks a button, it writes the slot number to CHOICE_FILE AND patches the
  #   beacon session JSON so the browser popup sees choice != null and self-closes.
  #
  # Layer 2 (1-4 s): browser beacon popup (full React UI).
  #   beacon_launch opens Chrome/Brave with the full web beacon.  When the user
  #   clicks there, it writes to CHOICE_FILE.
  #
  # If the user ignores both (at keyboard, typing their own prompt) neither
  # writes to CHOICE_FILE → no injection.

  local _choice_file _nc_pid _bp_pid
  _choice_file="/tmp/beacon-choice-${TAB_NAME}-$$"

  # Build action args from the first 3 non-"more" slots in _PROMPTS.
  local -a _notif_actions
  mapfile -t _notif_actions < <(
    jq -r '.[] | select(.slot != null and .style != "more") | "\(.slot)=\(.icon) \(.label)"' \
    "$_PROMPTS" 2>/dev/null | head -3
  )

  (
    result=$(python3 "$SCRIPT_DIR/notify-choice.py" \
      "Claude · ${label}" "Done — click to continue" "$label" \
      "${_notif_actions[@]}" 2>>"$LOG")
    if [ -n "$result" ] && [ ! -f "$_choice_file" ]; then
      printf '%s' "$result" > "${_choice_file}.tmp" \
        && mv "${_choice_file}.tmp" "$_choice_file" 2>/dev/null || true
    fi
  ) &
  _nc_pid=$!

  (
    result=$(beacon_launch stop "$label" "$session_file" 2>>"$LOG")
    if [ -n "$result" ] && [ ! -f "$_choice_file" ]; then
      printf '%s' "$result" > "${_choice_file}.tmp" \
        && mv "${_choice_file}.tmp" "$_choice_file" 2>/dev/null || true
    fi
  ) &
  _bp_pid=$!

  # Wait until a choice lands or both layers exit.
  while kill -0 "$_nc_pid" 2>/dev/null || kill -0 "$_bp_pid" 2>/dev/null; do
    if [ -f "$_choice_file" ]; then
      kill "$_nc_pid" "$_bp_pid" 2>/dev/null
      break
    fi
    sleep 0.2
  done

  choice=""
  [ -f "$_choice_file" ] && choice=$(cat "$_choice_file")
  rm -f "$_choice_file" "${_choice_file}.tmp"

  if [ -z "$choice" ]; then
    log "no choice from either layer — user types manually"
    exit 0
  fi
  log "popup choice=$choice"

  local inject_key inject_label queue_file
  queue_file="/tmp/agent-queue-${TAB_NAME,,}"

  # If choice is '1' (Next Best Task), check if there's a queue item and fire that instead.
  # This matches the web beacon logic and handles the race where the OS notification hits 0s first.
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

  # Capture rate-limit / capacity messages before any early-exit guard so the
  # stop hook that fires next can set capacityIssue=true in the beacon session.
  local _notif_message
  _notif_message=$(echo "$input" | jq -r '.message // empty' 2>/dev/null)
  if echo "$_notif_message" | grep -qiE \
    "rate.?limit|quota|credit|usage.?limit|token.?limit|out.of.tokens|context.window|maximum.context|insufficient.quota|at.capacity"; then
    echo "$(date +%s)" > "/tmp/agent-capacity-issue-${TAB_NAME}"
    log "notification: capacity issue detected — sentinel written for ${TAB_NAME}"
  fi

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

  # Only auto-inject the continue prompt when the user is away from the keyboard.
  # If they're active (idle < 60s) they'll see the sound alert and respond themselves —
  # injecting on top of their typing causes the double-prompt problem the Stop hook fix
  # already addressed.  Same idle detection logic used in handle_stop.
  local _notif_idle
  _notif_idle=$(
    if command -v xprintidle >/dev/null 2>&1; then
      ms=$(DISPLAY="${DISPLAY:-:0}" xprintidle 2>/dev/null || echo 99999999)
      echo $(( ms / 1000 ))
    else
      DISPLAY="${DISPLAY:-:0}" python3 "$SCRIPT_DIR/get-idle-secs.py" 2>/dev/null || echo 9999
    fi
  )
  if [ "${_BEACON_POPUP_MODE:-both}" = "disabled" ]; then
    log "notification: beacon disabled by user settings — skipping auto-inject"
    exit 0
  fi
  if [ "${_BEACON_MIN_IDLE:-0}" -gt 0 ] && [ "${_notif_idle:-9999}" -lt "$_BEACON_MIN_IDLE" ]; then
    log "notification: user active (idle=${_notif_idle}s < ${_BEACON_MIN_IDLE}s) — skipping auto-inject"
    exit 0
  fi

  # Context-aware prompt selection: read session health BEFORE queue dequeue.
  # Degraded health → skip queue and use unblock (fix first, advance later).
  # This mirrors sessionHealthBlocksQueue() on the client and the server-side gate
  # in /api/orchestration/run — all three paths must agree.
  local session_file auto_key _health
  session_file="$HOME/.claude/sessions/${TAB_NAME}.md"
  auto_key="next_best"
  _health=""
  if [ -f "$session_file" ]; then
    _health=$(grep "^health:" "$session_file" 2>/dev/null | sed 's/^health:[[:space:]]*//' | tr -d '\n\r')
    case "$_health" in
      "needs attention"|"critical") auto_key="unblock" ;;
    esac
  fi

  # Dequeue any user-dispatched task first — same logic handle_stop uses for slot 1.
  # Skipped when health is degraded so the agent focuses on recovery before new work.
  local queue_file
  queue_file="/tmp/agent-queue-${TAB_NAME,,}"
  if [ "$auto_key" = "next_best" ] && [ -f "$queue_file" ]; then
    local first_item tmp_q
    first_item=$(jq -r '.[0] // empty' "$queue_file" 2>/dev/null)
    if [ -n "$first_item" ]; then
      log "notification: dequeuing queued prompt instead of next_best"
      tmp_q="${queue_file}.tmp"
      jq 'del(.[0])' "$queue_file" > "$tmp_q" 2>/dev/null && mv "$tmp_q" "$queue_file"
      emit_or_inject_prompt "$TAB_NAME" "$first_item"
      write_inject_state "$TAB_NAME" "custom" "Queued prompt"
      exit 0
    fi
  fi

  local base session session_update_block
  base=$(get_prompt "$auto_key")
  [ -z "$base" ] && exit 0
  session_update_block="When done, update ${session_file} with exactly these lines:
done: <one sentence what you completed>
next: <one sentence what remains>
tests: <N pass · N fail, or 'no suite'>
todos: <count> TODOs
health: <good | needs attention | critical>"

  if [ -f "$session_file" ]; then
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

  emit_or_inject_prompt "$TAB_NAME" "$prompt"
  write_inject_state "$TAB_NAME" "$auto_key" "▶ Auto: ${auto_key}"
  log "notification: injected ${auto_key} (health=${_health:-unknown}) with session context"
}

case "$MODE" in
  stop) handle_stop ;;
  notification) handle_notification ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac
