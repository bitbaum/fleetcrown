#!/usr/bin/env bash
# cockpit-daemon.sh — polls the cloud control plane for pending commands and executes them locally.
#
# Usage:
#   COCKPIT_DAEMON_TOKEN=<secret> ./scripts/cockpit-daemon.sh
#
# Optional env vars:
#   COCKPIT_BASE_URL      — defaults to https://cockpitapp.vercel.app
#   COCKPIT_POLL_INTERVAL — seconds between polls, default 5
#   COCKPIT_DRY_RUN       — set to "1" to log commands without executing them
#
# The daemon authenticates via bearer token; the server finds the default user automatically.
# No user ID needed — the cloud determines which user's queue to drain.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared zellij helpers (inject_prompt, etc.)
# shellcheck source=agent-hook-lib.sh
source "$SCRIPT_DIR/agent-hook-lib.sh" 2>/dev/null || {
  echo "[daemon] ERROR: cannot source agent-hook-lib.sh" >&2
  exit 1
}

BASE_URL="${COCKPIT_BASE_URL:-https://cockpitapp.vercel.app}"
POLL_INTERVAL="${COCKPIT_POLL_INTERVAL:-5}"
PUSH_INTERVAL="${COCKPIT_PUSH_INTERVAL:-2}"
DRY_RUN="${COCKPIT_DRY_RUN:-0}"
TOKEN="${COCKPIT_DAEMON_TOKEN:-}"
CONF_FILE="${AGENT_PROJECTS_CONF:-${CLAUDE_PROJECTS_CONF:-$HOME/.config/agent-projects.conf}}"

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

# Returns 0 if user is actively typing in the given tab (marker file exists and is <60s old).
_is_user_typing_in_tab() {
  local tab="$1" now
  now=$(date +%s)
  for f in /tmp/cockpit-typing-*; do
    [ -f "$f" ] || continue
    local ftab fts
    ftab=$(sed -n '1p' "$f" 2>/dev/null | xargs 2>/dev/null)
    fts=$(sed -n '2p' "$f" 2>/dev/null | xargs 2>/dev/null)
    [ "${ftab,,}" = "${tab,,}" ] || continue
    [[ "$fts" =~ ^[0-9]+$ ]] || continue
    (( now - fts < 60 )) && return 0
  done
  return 1
}

execute_inject() {
  local id="$1" tab="$2" prompt="$3"
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN inject → tab=$tab prompt=${prompt:0:60}"
    mark_done "$id" "true"
    return 0
  fi

  # Wait up to 30 s for the user to finish typing — same guard as the API route.
  local waited=0
  while _is_user_typing_in_tab "$tab" && (( waited < 30 )); do
    log "inject deferred — user typing in $tab (${waited}s)"
    sleep 2
    (( waited += 2 ))
  done
  if _is_user_typing_in_tab "$tab"; then
    mark_done "$id" "false" "user still typing after 30s — inject skipped"
    log "inject skipped — user typing in $tab after 30s ✗"
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

execute_transcription() {
  local id="$1" audio_b64="$2" mime_type="$3"
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN transcribe id=$id"
    curl -sf -X PATCH \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"ok":true,"text":"dry run transcription"}' \
      "$BASE_URL/api/control/commands/$id" >/dev/null 2>&1 || true
    return 0
  fi

  log "transcribe id=$id (${#audio_b64} b64 chars)"
  local tmp_webm tmp_wav
  tmp_webm=$(mktemp /tmp/daemon-audio-XXXXXX.webm)
  tmp_wav="${tmp_webm%.webm}.wav"

  # Decode base64 audio
  echo "$audio_b64" | base64 -d > "$tmp_webm" 2>/dev/null
  if [ ! -s "$tmp_webm" ]; then
    rm -f "$tmp_webm"
    mark_done "$id" "false" "base64 decode produced empty file"
    log "transcribe failed — empty audio ✗"
    return 0
  fi

  # Convert to 16 kHz mono wav for Whisper
  if ! ffmpeg -nostdin -threads 0 -err_detect ignore_err \
      -i "$tmp_webm" -f wav -ac 1 -ar 16000 -y "$tmp_wav" \
      >/dev/null 2>&1; then
    rm -f "$tmp_webm" "$tmp_wav"
    mark_done "$id" "false" "ffmpeg conversion failed"
    log "transcribe failed — ffmpeg ✗"
    return 0
  fi

  # Run Whisper — reads model from beacon settings if set, else "base"
  local model="base"
  local settings_file="${BEACON_SETTINGS_PATH:-$HOME/.config/cockpit/beacon.json}"
  if [ -f "$settings_file" ]; then
    local m
    m=$(jq -r '.whisper_model // empty' "$settings_file" 2>/dev/null)
    [ -n "$m" ] && model="$m"
  fi

  local transcription
  transcription=$(python3 "$SCRIPT_DIR/transcribe.py" "$tmp_wav" "$model" 2>/dev/null)
  local exit_code=$?
  rm -f "$tmp_webm" "$tmp_wav"

  if [ $exit_code -ne 0 ] || [ -z "$transcription" ]; then
    mark_done "$id" "false" "whisper returned no text"
    log "transcribe failed — no speech ✗"
    return 0
  fi

  # Store result — text field is picked up by the polling endpoint
  local body
  body=$(printf '{"ok":true,"text":%s}' "$(printf '%s' "$transcription" | jq -Rs .)")
  curl -sf -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$BASE_URL/api/control/commands/$id" >/dev/null 2>&1 || true
  log "transcribe done ✓ (${#transcription} chars)"
}

# ── Runtime state push ────────────────────────────────────────────────────────
# Reads /proc + /tmp every PUSH_INTERVAL seconds and POSTs to /api/control/runtime-state
# so the Vercel control plane sees live agent status without needing local access.

# Read a /tmp sentinel file; output an integer or the JSON literal null.
_sentinel() {
  local f="$1"
  if [ -f "$f" ]; then
    local v
    v=$(cat "$f" 2>/dev/null)
    [[ "$v" =~ ^[0-9]+$ ]] && echo "$v" && return
  fi
  echo "null"
}

# Scan /proc once; output lines of "<cwd> <agent_basename>" for all running agents.
_scan_agents() {
  for pd in /proc/[0-9]*/; do
    pd="${pd%/}"
    [ -f "$pd/cmdline" ] || continue
    local argv0 basename
    argv0=$(tr '\0' '\n' < "$pd/cmdline" 2>/dev/null | head -1) || continue
    basename="${argv0##*/}"
    case "$basename" in
      claude|codex|gemini|openclaw) ;;
      *) continue ;;
    esac
    local cwd
    cwd=$(readlink "$pd/cwd" 2>/dev/null) || continue
    echo "$cwd $basename"
  done
}

push_runtime_state() {
  [ -f "$CONF_FILE" ] || return

  local agent_lines
  agent_lines=$(_scan_agents 2>/dev/null || true)

  # Collect all tab names currently open across every Zellij session (once per push cycle).
  local all_open_tabs=""
  while IFS= read -r zs; do
    [ -z "$zs" ] && continue
    local tabs
    tabs=$(ZELLIJ_SESSION_NAME="$zs" zellij action query-tab-names 2>/dev/null || true)
    all_open_tabs="${all_open_tabs}"$'\n'"${tabs}"
  done < <(zellij list-sessions -n 2>/dev/null | awk '{print $1}')

  local projects_arr="[]"

  while IFS='|' read -r tab dir || [ -n "$tab" ]; do
    # Skip comments and blank lines
    [[ "$tab" =~ ^[[:space:]]*# ]] && continue
    tab=$(echo "$tab" | xargs 2>/dev/null)
    dir=$(echo "$dir" | xargs 2>/dev/null)
    [ -z "$tab" ] || [ -z "$dir" ] && continue

    # Determine agent running + active agent names for this dir
    local running="false" agents_json="[]"
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      local cwd agent_name
      # line format: "<cwd> <agent_basename>"
      cwd="${line% *}"
      agent_name="${line##* }"
      if [ "$cwd" = "$dir" ] || [[ "$cwd" == "$dir/"* ]]; then
        running="true"
        agents_json=$(echo "$agents_json" | jq --arg a "$agent_name" '. + [$a] | unique' 2>/dev/null || echo "$agents_json")
      fi
    done <<< "$agent_lines"

    # Check if this project's Zellij tab is actually open (case-insensitive)
    local tab_open="false"
    if echo "$all_open_tabs" | grep -qiF "$tab"; then
      tab_open="true"
    fi

    # Sentinel timestamps
    local ready_at closing_at closed_at lock_at
    ready_at=$(_sentinel "/tmp/agent-ready-${tab}")
    closing_at=$(_sentinel "/tmp/agent-closing-${tab}")
    closed_at=$(_sentinel "/tmp/agent-closed-${tab}")
    lock_at=$(_sentinel "/tmp/agent-stop-active-${tab}")

    # Current prompt JSON
    local cpk="" cpl="" cpsat="null"
    local pf="/tmp/agent-current-prompt-${tab}"
    if [ -f "$pf" ]; then
      local pj
      pj=$(cat "$pf" 2>/dev/null)
      if [ -n "$pj" ]; then
        cpk=$(echo "$pj" | jq -r '.key // empty' 2>/dev/null || true)
        cpl=$(echo "$pj" | jq -r '.label // empty' 2>/dev/null || true)
        local sat
        sat=$(echo "$pj" | jq -r '.startedAt // empty' 2>/dev/null || true)
        [[ "$sat" =~ ^[0-9]+$ ]] && cpsat="$sat"
      fi
    fi

    local proj
    proj=$(jq -n \
      --arg      tab     "$tab" \
      --argjson  running "$running" \
      --argjson  tab_open "$tab_open" \
      --argjson  agents  "$agents_json" \
      --arg      cpk     "$cpk" \
      --arg      cpl     "$cpl" \
      --argjson  cpsat   "$cpsat" \
      --argjson  ready   "$ready_at" \
      --argjson  lock    "$lock_at" \
      --argjson  closing "$closing_at" \
      --argjson  closed  "$closed_at" \
      '{
        tab:                    $tab,
        agentRunning:           $running,
        tabOpen:                $tab_open,
        activeAgents:           $agents,
        currentPromptKey:       (if $cpk   == "" then null else $cpk   end),
        currentPromptLabel:     (if $cpl   == "" then null else $cpl   end),
        currentPromptStartedAt: (if $cpsat == null then null else ($cpsat | tonumber) end),
        readyAt:                (if $ready   == null then null else ($ready   | tonumber) end),
        lockAt:                 (if $lock    == null then null else ($lock    | tonumber) end),
        closingAt:              (if $closing == null then null else ($closing | tonumber) end),
        closedAt:               (if $closed  == null then null else ($closed  | tonumber) end)
      }' 2>/dev/null) || continue
    projects_arr=$(echo "$projects_arr" | jq ". + [$proj]" 2>/dev/null || echo "$projects_arr")

  done < "$CONF_FILE"

  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"projects\":$projects_arr}" \
    "$BASE_URL/api/control/runtime-state" >/dev/null 2>&1 || true
}

_push_loop() {
  while true; do
    push_runtime_state
    sleep "$PUSH_INTERVAL"
  done
}

log "starting — polling $BASE_URL every ${POLL_INTERVAL}s, pushing state every ${PUSH_INTERVAL}s"
_push_loop &
_PUSH_PID=$!
trap 'kill "$_PUSH_PID" 2>/dev/null; exit' INT TERM

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
    transcribe)
      audio_b64=$(echo "$payload" | jq -r '.audio_b64')
      mime_type=$(echo "$payload" | jq -r '.mime_type // "audio/webm"')
      execute_transcription "$id" "$audio_b64" "$mime_type"
      ;;
    *)
      log "unknown command type: $type — marking done"
      mark_done "$id" "false" "unknown type: $type"
      ;;
  esac

  # Poll immediately for any queued follow-ups, then wait.
  sleep 1
done
