#!/bin/bash
set -euo pipefail

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "usage: agent-hook-bridge.sh <stop|notification|autopilot> [tab session_file]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source brand SSOT (APP_NAME, APP_SLUG, _brand_env, _brand_tmp).
# shellcheck source=_brand.sh
source "$SCRIPT_DIR/_brand.sh"

_load_cockpit_daemon_env() {
  local f="${HOME}/.config/cockpit/daemon.env"
  [ -f "$f" ] || return 0
  set -a
  # shellcheck source=/dev/null
  . "$f"
  set +a
}

_resolve_app_base_url() {
  if [ -n "${COCKPIT_BASE_URL:-}" ]; then
    printf '%s' "${COCKPIT_BASE_URL}"
    return
  fi
  if [ -n "${APP_BASE_URL:-}" ]; then
    printf '%s' "${APP_BASE_URL}"
    return
  fi
  _brand_env URL "https://${APP_DOMAIN}"
}

_load_cockpit_daemon_env
APP_BASE_URL="$(_resolve_app_base_url)"
readonly APP_BASE_URL
# Wire-format prefixes — must match CUSTOM_CHOICE_PREFIX / SWITCH_CHOICE_PREFIX in src/lib/constants/control.ts
readonly CUSTOM_CHOICE_PREFIX="custom:"
readonly SWITCH_CHOICE_PREFIX="switch:"
python3 "$SCRIPT_DIR/sync-agent-runtime-config.py" >/dev/null 2>&1 || true
# shellcheck source=/dev/null
source "$SCRIPT_DIR/agent-hook-lib.sh"

LOG=/tmp/agent-hooks.log
log() { echo "[$(date '+%H:%M:%S')] ${MODE}: $*" >> "$LOG"; }

_token_from_env_or_file() {
  local key="$1"
  local val="" f="${HOME}/.config/cockpit/daemon.env"
  val="$(_brand_env "$key" "")"
  if [ -n "$val" ]; then
    printf '%s' "$val"
    return
  fi
  if [ -f "$f" ]; then
    val=$(grep -m1 "^COCKPIT_${key}=" "$f" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" | xargs 2>/dev/null || true)
    if [ -n "$val" ]; then
      printf '%s' "$val"
      return
    fi
  fi
  grep -m1 "^COCKPIT_${key}=" "$SCRIPT_DIR/../.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" | xargs 2>/dev/null || true
}

# Read per-user beacon settings from the API (uses daemon token for auth).
# Falls back to Python file reader when the app is offline.
_BEACON_TOKEN="$(_token_from_env_or_file DAEMON_TOKEN)"
_BEACON_SETTINGS_JSON=""
_BEACON_AUTH_HEADER=""
if [ -n "$_BEACON_TOKEN" ]; then
  _BEACON_AUTH_HEADER="$(_brand_tmp "hook-auth")"
  umask 077
  printf 'Authorization: Bearer %s\n' "$_BEACON_TOKEN" > "$_BEACON_AUTH_HEADER"
  _BEACON_SETTINGS_JSON=$(curl -sf --max-time 2 \
    -H "@$_BEACON_AUTH_HEADER" \
    "${APP_BASE_URL}/api/beacon-settings" 2>/dev/null || true)
fi

if [ -n "$_BEACON_SETTINGS_JSON" ]; then
  _BEACON_MIN_IDLE=$(printf '%s' "$_BEACON_SETTINGS_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('min_idle_seconds',0))" 2>/dev/null || echo 0)
  _BEACON_POPUP_MODE=$(printf '%s' "$_BEACON_SETTINGS_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('popup_mode','both'))" 2>/dev/null || echo both)
  _BEACON_AUTO_MODE=$(printf '%s' "$_BEACON_SETTINGS_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('auto_inject_mode','strategist'))" 2>/dev/null || echo strategist)
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
  _BEACON_AUTO_MODE=$(python3 -c "
import sys; sys.path.insert(0, '$SCRIPT_DIR')
from _beacon_config import get_auto_inject_mode
print(get_auto_inject_mode())
" 2>/dev/null || echo strategist)
fi
export BEACON_POPUP_MODE="$_BEACON_POPUP_MODE"

# M4 — emit a worker.finished event directly to the local JSONL log so the
# new home/ Brain learns about completed runs without depending on the
# Vercel finish endpoint round-trip. Mirrors the inferOutcome v1 logic from
# src/lib/orchestration/infer-outcome.ts. Fire-and-forget; never blocks.
infer_outcome_v1() {
  local done_text="$1" tests_text="$2" health_text="$3" duration_ms="$4"
  local h t
  h=$(printf '%s' "$health_text" | tr 'A-Z' 'a-z')
  t=$(printf '%s' "$tests_text"  | tr 'A-Z' 'a-z')
  if [[ "$h" == *critical* ]]; then echo error; return; fi
  if (( duration_ms > 1800000 )) && [ -z "$done_text" ]; then echo hang; return; fi
  if [[ "$t" == *fail* ]] || [[ "$h" == *"needs attention"* ]]; then echo partial; return; fi
  if [[ "$h" == *good* ]] && [ -n "$done_text" ]; then echo success; return; fi
  echo partial
}

emit_worker_finished() {
  local tab_name="$1" session_file="$2"
  command -v jq >/dev/null 2>&1 || return 0   # silently skip if jq missing
  # Symmetric to home/watcher.ts: filter to registered projects so scratch
  # tabs (Tab #1, ad-hoc shells, etc.) don't pollute the brain's state.
  # Reads the existing tab→path SSOT used everywhere else in the system.
  local projects_conf="${APP_PROJECTS_CONF:-${AGENT_PROJECTS_CONF:-${CLAUDE_PROJECTS_CONF:-$HOME/.config/agent-projects.conf}}}"
  if [ -f "$projects_conf" ]; then
    local lower_tab; lower_tab=$(printf '%s' "$tab_name" | tr 'A-Z' 'a-z')
    local match
    match=$(awk -v t="$lower_tab" -F'|' '
      /^[[:space:]]*#/ {next}
      NF >= 2 {n=tolower($1); gsub(/^[[:space:]]+|[[:space:]]+$/, "", n); if (n==t) print "1"}
    ' "$projects_conf")
    [ -z "$match" ] && return 0   # tab not registered — skip
  fi
  local log_path="$HOME/.${APP_SLUG}/events.jsonl"
  mkdir -p "$(dirname "$log_path")"
  local done_line next_line tests_line todos_line health_line
  done_line=""; next_line=""; tests_line=""; todos_line=""; health_line=""
  if [ -f "$session_file" ]; then
    done_line=$(grep   -m1 '^done:'   "$session_file" 2>/dev/null | sed 's/^done:[[:space:]]*//')
    next_line=$(grep   -m1 '^next:'   "$session_file" 2>/dev/null | sed 's/^next:[[:space:]]*//')
    tests_line=$(grep  -m1 '^tests:'  "$session_file" 2>/dev/null | sed 's/^tests:[[:space:]]*//')
    todos_line=$(grep  -m1 '^todos:'  "$session_file" 2>/dev/null | sed 's/^todos:[[:space:]]*//')
    health_line=$(grep -m1 '^health:' "$session_file" 2>/dev/null | sed 's/^health:[[:space:]]*//')
  fi
  # Read duration AND runId from the /tmp/<slug>-run-<tab> sentinel that
  # cockpit-daemon.sh:execute_inject wrote at dispatch time. The runId is
  # required for state.applyEvent's cancelledRunIds → user_abort relabel
  # to match (otherwise a user-cancelled run gets recorded as partial in
  # recentOutcomes and drags computeConfidence down). Sentinel file
  # contains the runId on a single line; mtime is the start time.
  local duration_ms=0 run_id="" run_sentinel
  run_sentinel="$(_brand_tmp "run-${tab_name}")"
  if [ -f "$run_sentinel" ]; then
    local start_s now_s
    start_s=$(stat -c %Y "$run_sentinel" 2>/dev/null || echo 0)
    now_s=$(date +%s)
    if [ "$start_s" -gt 0 ]; then duration_ms=$(( (now_s - start_s) * 1000 )); fi
    run_id=$(cat "$run_sentinel" 2>/dev/null | tr -d '[:space:]')
  fi
  local outcome id ts
  outcome=$(infer_outcome_v1 "$done_line" "$tests_line" "$health_line" "$duration_ms")
  id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "00000000-0000-4000-8000-000000000000")
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  # runId is optional in the schema (parseEvent accepts missing). Build the
  # event with or without it via jq's `+` so an empty run_id (no sentinel)
  # produces a valid event sans runId — matches the legacy stop-hook shape.
  local runid_obj="{}"
  if [ -n "$run_id" ]; then
    runid_obj=$(jq -nc --arg runId "$run_id" '{runId:$runId}')
  fi
  jq -nc \
    --arg id "$id" --arg ts "$ts" --arg project "$tab_name" \
    --argjson durationMs "$duration_ms" --arg outcome "$outcome" \
    --arg done "$done_line" --arg next "$next_line" --arg tests "$tests_line" \
    --arg todos "$todos_line" --arg health "$health_line" \
    --argjson runid "$runid_obj" \
    '{v:1, id:$id, ts:$ts, kind:"worker.finished", project:$project, outcome:$outcome, durationMs:$durationMs, handoff:{done:$done, next:$next, tests:$tests, todos:$todos, health:$health}} + $runid' \
    >> "$log_path" 2>/dev/null || true
}

patch_project_state() {
  local tab_name="$1"
  local field="$2"
  # Portable ISO-8601 — GNU date rejects --iso-8601=milliseconds (only ns|seconds|…).
  # A failing date under set -e previously killed handle_stop before autopilot ran.
  local iso_now
  iso_now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date --iso-8601=seconds 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
  [ -n "${_BEACON_AUTH_HEADER:-}" ] || return 0
  curl -sf -X PATCH "${APP_BASE_URL}/api/project-states/${tab_name}" \
    -H "Content-Type: application/json" \
    -H "@$_BEACON_AUTH_HEADER" \
    -d "{\"tabName\":\"${tab_name}\",\"${field}\":\"${iso_now}\"}" &>/dev/null &
}

# DB queue is authoritative; notify it after a local mirror item is consumed.
# Fire-and-forget so a slow or offline app never blocks the agent hook.
sync_consumed_queue_item() {
  local tab_name="$1" consumed="$2"
  [ -n "${_BEACON_AUTH_HEADER:-}" ] || return 0
  (
    local encoded payload
    encoded=$(printf '%s' "$tab_name" | jq -sRr @uri)
    payload=$(jq -nc --arg consumed "$consumed" '{consumed:$consumed}')
    curl -sf --max-time 15 -X POST "${APP_BASE_URL}/api/beacon/queue/${encoded}" \
      -H "Content-Type: application/json" \
      -H "@$_BEACON_AUTH_HEADER" \
      -d "$payload" &>/dev/null || true
  ) &
}

dequeue_local_queue_item() {
  local tab_name="$1" consumed="$2" queue_file tmp_q
  queue_file="/tmp/agent-queue-${tab_name,,}"
  [ -f "$queue_file" ] || return 0
  jq -e --arg consumed "$consumed" 'index($consumed) != null' "$queue_file" >/dev/null 2>&1 || return 0
  tmp_q="${queue_file}.tmp"
  if jq --arg consumed "$consumed" 'index($consumed) as $i | del(.[$i])' "$queue_file" > "$tmp_q" 2>/dev/null \
      && mv "$tmp_q" "$queue_file"; then
    sync_consumed_queue_item "$tab_name" "$consumed"
  fi
}

# DB queue (project_states.prompt_queue) is authoritative; /tmp mirror is for
# local hooks. Autopilot must read the API when the daemon token is present.
_fetch_prompt_queue_json() {
  local tab_name="$1"
  local queue_file="/tmp/agent-queue-${tab_name,,}"
  local queue_json="[]"
  if [ -n "${_BEACON_AUTH_HEADER:-}" ]; then
    local encoded api_resp
    encoded=$(printf '%s' "$tab_name" | jq -sRr @uri)
    api_resp=$(curl -sf --max-time 4 \
      -H "@$_BEACON_AUTH_HEADER" \
      "${APP_BASE_URL}/api/beacon/queue/${encoded}" 2>/dev/null || true)
    if [ -n "$api_resp" ]; then
      queue_json=$(printf '%s' "$api_resp" | jq -c '.queue // []' 2>/dev/null || printf '[]')
    fi
  fi
  if [ "$queue_json" = "[]" ] && [ -f "$queue_file" ]; then
    queue_json=$(jq -c 'if type == "array" then . else [] end' "$queue_file" 2>/dev/null || printf '[]')
  fi
  printf '%s' "$queue_json"
}

# Finishes an orchestration_runs row with the captured handoff so dispatch
# can learn from outcomes. The run id was written to $(_brand_tmp "run-<tab>")
# at dispatch time. Fire-and-forget — never blocks the stop hook.
finish_orchestration_run() {
  local tab_name="$1"
  local session_file="$2"
  local run_sentinel="$(_brand_tmp "run-${tab_name}")"
  [ -f "$run_sentinel" ] || return 0
  local run_id done_line next_line tests_line todos_line health_line
  run_id=$(cat "$run_sentinel" 2>/dev/null | tr -d '[:space:]')
  [ -z "$run_id" ] && return 0
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
  curl -sf -X POST "${APP_BASE_URL}/api/orchestration/runs/${run_id}/finish" \
    -H "Content-Type: application/json" \
    -H "@$_BEACON_AUTH_HEADER" \
    -d "$payload" &>/dev/null &
  rm -f "$run_sentinel"
}


queue_inject_via_api() {
  local tab_name="$1" prompt_key="${2:-}" custom_prompt="${3:-}"
  [ -n "${_BEACON_AUTH_HEADER:-}" ] || return 1
  local live_tab="$tab_name"
  if type _resolve_live_tab_name >/dev/null 2>&1; then
    live_tab=$(_resolve_live_tab_name "$tab_name" 2>/dev/null) || live_tab="$tab_name"
  fi
  local payload http_code resp
  if [ -n "$custom_prompt" ]; then
    payload=$(jq -nc --arg tab "$live_tab" --arg p "$custom_prompt" '{tab:$tab,customPrompt:$p}')
  elif [ -n "$prompt_key" ]; then
    payload=$(jq -nc --arg tab "$live_tab" --arg key "$prompt_key" '{tab:$tab,promptKey:$key}')
  else
    return 1
  fi
  resp=$(curl -sS --max-time 20 -X POST "${APP_BASE_URL}/api/inject" \
    -H "Content-Type: application/json" \
    -H "@$_BEACON_AUTH_HEADER" \
    -d "$payload" \
    -w $'\n%{http_code}' 2>/dev/null || true)
  http_code=$(printf '%s' "$resp" | tail -1)
  resp=$(printf '%s' "$resp" | sed '$d')
  [ "$http_code" = "200" ] || return 1
  printf '%s' "$resp" | jq -e '.ok == true' >/dev/null 2>&1
}

emit_or_inject_prompt() {
  local tab_name="$1"
  local prompt="$2"
  local prompt_key="${3:-custom}"
  local label="${4:-Autopilot}"
  if [ "${AGENT_BRIDGE_EMIT_PROMPT:-0}" = "1" ]; then
    printf '%s' "$prompt"
    return 0
  fi
  local live_tab="$tab_name"
  if type _resolve_live_tab_name >/dev/null 2>&1; then
    live_tab=$(_resolve_live_tab_name "$tab_name" 2>/dev/null) || live_tab="$tab_name"
  fi
  if [ -n "${_BEACON_AUTH_HEADER:-}" ]; then
    if [ -n "$prompt" ] && { [ "$prompt_key" = "custom" ] || [ "$prompt_key" = "strategist" ]; }; then
      local truncated
      truncated=$(printf '%s' "$prompt" | head -c 3900)
      if queue_inject_via_api "$live_tab" "" "$truncated"; then
        write_inject_state "$live_tab" "$prompt_key" "$label"
        return 0
      fi
    elif [ -n "$prompt_key" ] && [ "$prompt_key" != "custom" ]; then
      if queue_inject_via_api "$live_tab" "$prompt_key" ""; then
        write_inject_state "$live_tab" "$prompt_key" "$label"
        return 0
      fi
    fi
    log "autopilot: API queue failed — falling back to direct inject for ${live_tab}"
  fi
  if [ -z "$prompt" ] && [ -n "$prompt_key" ] && [ "$prompt_key" != "custom" ]; then
    prompt=$(get_prompt "$prompt_key" 2>/dev/null || true)
  fi
  [ -n "$prompt" ] || return 1
  inject_prompt "$live_tab" "$prompt" || return 1
  write_inject_state "$live_tab" "$prompt_key" "$label"
}

agent_command() {
  local agent="$1" dir="$2"
  # Delegate to the centralized launcher in _agents.sh (sourced via agent-hook-lib.sh)
  _agent_launch_cmd "$agent" "$dir" ""
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
      prompt_file="$(_brand_tmp "${agent}-prompt-$(date +%s)-$$.txt")"
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

# Autopilot — fire when the agent has just signaled ready and we want to
# auto-continue. Reads /api/control/dispatch (strategist|queue|nextbest|off),
# composes the resulting prompt with session context, and injects back into the
# Zellij tab. Returns 0 if a prompt was injected, 1 otherwise.
#
# Behavior:
#   _BEACON_AUTO_MODE = "off"    → no autopilot
#   _BEACON_AUTO_MODE = anything → POST dispatch; server-side gate decides
#
# Cockpit's promise is autopilot. The Stop hook is the moment that promise
# pays off — agent finished, next prompt composed and running before the user
# looks. /control + push notifications carry the ambient signal.
autopilot_dispatch_and_inject() {
  local tab_name="$1" session_file="$2"

  if [ "${_BEACON_AUTO_MODE:-strategist}" = "off" ]; then
    log "autopilot: auto_inject_mode=off — staying idle (manual mode)"
    return 1
  fi

  if [ -z "${_BEACON_AUTH_HEADER:-}" ]; then
    log "autopilot: no daemon auth header — skipping dispatch"
    return 1
  fi

  local done_line next_line tests_line todos_line health_line
  done_line=""; next_line=""; tests_line=""; todos_line=""; health_line=""
  if [ -f "$session_file" ]; then
    done_line=$(grep   -m1 '^done:'   "$session_file" 2>/dev/null | sed 's/^done:[[:space:]]*//' || true)
    next_line=$(grep   -m1 '^next:'   "$session_file" 2>/dev/null | sed 's/^next:[[:space:]]*//' || true)
    tests_line=$(grep  -m1 '^tests:'  "$session_file" 2>/dev/null | sed 's/^tests:[[:space:]]*//' || true)
    todos_line=$(grep  -m1 '^todos:'  "$session_file" 2>/dev/null | sed 's/^todos:[[:space:]]*//' || true)
    health_line=$(grep -m1 '^health:' "$session_file" 2>/dev/null | sed 's/^health:[[:space:]]*//' || true)
  fi

  local queue_json
  queue_json=$(_fetch_prompt_queue_json "$tab_name")

  local payload
  payload=$(jq -nc \
    --arg done "$done_line" --arg next "$next_line" --arg health "$health_line" \
    --arg tests "$tests_line" --arg todos "$todos_line" \
    --arg project "$tab_name" \
    --argjson queue "$queue_json" \
    '{handoff:{done:$done,next:$next,health:$health,tests:$tests,todos:$todos},queue:$queue,projectName:$project,projectKey:$project}')

  local result action prompt reason
  result=$(curl -sf --max-time 18 -X POST "${APP_BASE_URL}/api/control/dispatch" \
    -H "Content-Type: application/json" -H "@$_BEACON_AUTH_HEADER" \
    -d "$payload" 2>/dev/null || true)
  if [ -z "$result" ]; then
    log "autopilot: dispatch returned empty (network/auth) — staying idle"
    return 1
  fi
  action=$(printf '%s' "$result" | jq -r '.action // "off"' 2>/dev/null || echo "off")
  prompt=$(printf '%s' "$result" | jq -r '.prompt // empty' 2>/dev/null || true)
  reason=$(printf '%s' "$result" | jq -r '.reason // empty' 2>/dev/null || true)

  case "$action" in
    composed)
      if [ -n "$prompt" ]; then
        emit_or_inject_prompt "$tab_name" "$prompt" "strategist" "${reason:-Strategist autopilot}"
        log "autopilot: injected COMPOSED — ${reason}"
        return 0
      fi
      log "autopilot: composed action but empty prompt — falling through to next_best"
      ;;
    queue)
      local first_item
      first_item=$(printf '%s' "$queue_json" | jq -r '.[0] // empty' 2>/dev/null || true)
      if [ -n "$first_item" ]; then
        dequeue_local_queue_item "$tab_name" "$first_item"
        emit_or_inject_prompt "$tab_name" "$first_item" "custom" "Queued prompt"
        log "autopilot: injected QUEUE head"
        return 0
      fi
      log "autopilot: queue action but no queue item — falling through to next_best"
      ;;
    off)
      log "autopilot: server gate said OFF (${reason}) — staying idle"
      return 1
      ;;
    nextbest)
      ;;  # fall through to canned next_best below
    *)
      log "autopilot: unknown action=${action} — staying idle"
      return 1
      ;;
  esac

  if emit_or_inject_prompt "$tab_name" "" "next_best" "Autopilot next_best"; then
    log "autopilot: injected NEXTBEST — ${reason}"
    return 0
  fi

  local base session session_update_block
  base=$(get_prompt "next_best")
  if [ -z "$base" ]; then
    log "autopilot: next_best prompt missing from library — staying idle"
    return 1
  fi
  session_update_block="When done, update ${session_file} with exactly these lines:
status: ready | working     # 'ready' = fully done; auto-inject may fire. 'working' = more to do.
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

  emit_or_inject_prompt "$tab_name" "$prompt" "next_best" "Autopilot next_best"
  log "autopilot: injected NEXTBEST (local fallback) — ${reason}"
  return 0
}

# Fire-and-forget Web Push to the user's subscribed devices. The endpoint
# lands in Stage 5 of the autopilot rollout; until it exists, the 404/503 is
# silently dropped — autopilot is the load-bearing signal, push is additive.
push_notify_stop() {
  local tab="$1" project_label="$2" session_file="$3"
  [ -n "${_BEACON_AUTH_HEADER:-}" ] || return 0
  [ "${_BEACON_POPUP_MODE:-web}" = "disabled" ] && return 0

  local next_line=""
  if [ -f "$session_file" ]; then
    next_line=$(grep -m1 '^next:' "$session_file" 2>/dev/null | sed 's/^next:[[:space:]]*//' | head -c 240 || true)
  fi

  local payload
  payload=$(jq -nc \
    --arg tab "$tab" --arg project "$project_label" --arg next "$next_line" --arg kind "stopped" \
    '{tab:$tab, projectName:$project, next:$next, kind:$kind}')

  (curl -sf --max-time 4 -X POST "${APP_BASE_URL}/api/push/notify" \
    -H "Content-Type: application/json" -H "@$_BEACON_AUTH_HEADER" \
    -d "$payload" >/dev/null 2>&1 || true) &
}

handle_stop() {
  find /tmp -maxdepth 1 -name "agent-stop-active-*" -mmin +5 -delete 2>/dev/null
  find /tmp -maxdepth 1 -name "claude-stop-active-*" -mmin +5 -delete 2>/dev/null

  local input cwd label sentinel closed_ts ready_ts session_file
  input=$(cat)
  cwd=$(echo "$input" | jq -r '.cwd // empty')

  resolve_tab "$cwd"
  label="${TAB_NAME:-$(basename "$cwd")}"
  if type _resolve_live_adapter >/dev/null 2>&1; then
    _resolve_live_adapter "${TAB_NAME:-}" "$cwd" 2>/dev/null || true
  else
    resolve_adapter 2>/dev/null || true
  fi
  log "fired — label=$label adapter=${ADAPTER:-claude}"
  [ -z "${TAB_NAME:-}" ] && exit 0
  session_file="$(_session_file "${TAB_NAME}" "${ADAPTER:-claude}")"

  # Atomically claim the stop-active lock using noclobber so concurrent stop
  # hooks can't both pass the check. A plain test-then-write is a TOCTOU race.
  local lock="/tmp/agent-stop-active-${TAB_NAME}"
  if ! ( set -C; : > "$lock" ) 2>/dev/null; then
    local existing_age
    existing_age=$(( $(date +%s) - $(stat -c %Y "$lock" 2>/dev/null || echo 0) ))
    if [ "$existing_age" -lt 90 ]; then
      log "skipping — another stop is active for ${TAB_NAME} (${existing_age}s old)"
      exit 0
    fi
    : > "$lock"
  fi
  trap "rm -f '$lock'" EXIT

  # Clear the tracked prompt; the agent just ended that work cycle.
  rm -f "/tmp/agent-current-prompt-${TAB_NAME}" "/tmp/claude-current-prompt-${TAB_NAME}"

  # User explicitly asked to close the session (via /control hard-stop or the
  # `close_session` queue entry). Honor it — no autopilot, no push.
  sentinel="/tmp/agent-session-closed-${TAB_NAME}"
  if [ -f "$sentinel" ]; then
    log "close-session sentinel set — closing session, autopilot suppressed"
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

  # Autopilot first — must run before any step that could fail under set -e.
  autopilot_dispatch_and_inject "$TAB_NAME" "$session_file" || true

  patch_project_state "$TAB_NAME" "readyAt"

  # Close the orchestration run + emit worker.finished so /control reflects the
  # handoff before the next cycle starts.
  finish_orchestration_run "$TAB_NAME" "$session_file"
  emit_worker_finished "$TAB_NAME" "$session_file"

  play_sound "complete"

  # Ambient signal — push notification to subscribed devices (phone, desktop).
  push_notify_stop "$TAB_NAME" "$label" "$session_file"
}

handle_notification() {
  local input cwd lock age sentinel closing closed prompt
  input=$(cat)
  cwd=$(echo "$input" | jq -r '.cwd // empty')

  resolve_tab "$cwd"
  resolve_adapter 2>/dev/null || true
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
  if [ "${_BEACON_AUTO_MODE:-strategist}" = "off" ]; then
    log "notification: automatic continuation policy is manual — skipping auto-inject"
    exit 0
  fi
  if [ -f "/tmp/${APP_SLUG}-auto-continue-${TAB_NAME,,}" ]; then
    log "notification: automatic continuation paused for ${TAB_NAME} — skipping auto-inject"
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
  session_file="$(_session_file "${TAB_NAME}" "${ADAPTER:-claude}")"
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
  local _auto_action first_item queue_json
  queue_json=$(_fetch_prompt_queue_json "$TAB_NAME")
  first_item=$(printf '%s' "$queue_json" | jq -r '.[0] // empty' 2>/dev/null || true)
  case "${_BEACON_AUTO_MODE:-strategist}" in
    queue_only)
      if [ -z "$first_item" ]; then
        log "notification: queue-only policy has no queued instruction — skipping auto-inject"
        exit 0
      fi
      _auto_action="queue"
      ;;
    next_best) _auto_action="nextbest" ;;
    strategist)
      _auto_action="nextbest"
      if [ "$auto_key" = "next_best" ] && [ -n "${_BEACON_AUTH_HEADER:-}" ]; then
        local dispatch_payload dispatch_result dispatch_prompt
        dispatch_payload=$(jq -nc \
          --arg done "$(grep -m1 '^done:' "$session_file" 2>/dev/null | sed 's/^done:[[:space:]]*//' || true)" \
          --arg next "$(grep -m1 '^next:' "$session_file" 2>/dev/null | sed 's/^next:[[:space:]]*//' || true)" \
          --arg health "$_health" \
          --arg tests "$(grep -m1 '^tests:' "$session_file" 2>/dev/null | sed 's/^tests:[[:space:]]*//' || true)" \
          --arg todos "$(grep -m1 '^todos:' "$session_file" 2>/dev/null | sed 's/^todos:[[:space:]]*//' || true)" \
          --arg project "$TAB_NAME" \
          --argjson queue "$queue_json" \
          '{handoff:{done:$done,next:$next,health:$health,tests:$tests,todos:$todos},queue:$queue,projectName:$project,projectKey:$project}')
        dispatch_result=$(curl -sf --max-time 18 -X POST "${APP_BASE_URL}/api/control/dispatch" \
          -H "Content-Type: application/json" -H "@$_BEACON_AUTH_HEADER" -d "$dispatch_payload" 2>/dev/null || true)
        _auto_action=$(printf '%s' "$dispatch_result" | jq -r '.action // "nextbest"' 2>/dev/null || echo nextbest)
        if [ "$_auto_action" = "composed" ]; then
          dispatch_prompt=$(printf '%s' "$dispatch_result" | jq -r '.prompt // empty' 2>/dev/null)
          if [ -n "$dispatch_prompt" ]; then
            emit_or_inject_prompt "$TAB_NAME" "$dispatch_prompt"
            write_inject_state "$TAB_NAME" "custom" "Strategist prompt"
            log "notification: injected strategist-composed prompt"
            exit 0
          fi
          _auto_action="nextbest"
        elif [ "$_auto_action" = "off" ]; then
          log "notification: strategist dispatch suppressed automatic continuation"
          exit 0
        fi
      fi
      ;;
    *) _auto_action="nextbest" ;;
  esac

  if [ "$auto_key" = "next_best" ] && [ "$_auto_action" = "queue" ] && [ -n "$first_item" ]; then
    if [ -n "$first_item" ]; then
      log "notification: dequeuing queued prompt instead of next_best"
      dequeue_local_queue_item "$TAB_NAME" "$first_item"
      emit_or_inject_prompt "$TAB_NAME" "$first_item"
      write_inject_state "$TAB_NAME" "custom" "Queued prompt"
      exit 0
    fi
  fi

  local base session session_update_block
  base=$(get_prompt "$auto_key")
  [ -z "$base" ] && exit 0
  session_update_block="When done, update ${session_file} with exactly these lines:
status: ready | working     # 'ready' = fully done; auto-inject may fire. 'working' = more to do.
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
  autopilot)
    TAB_NAME="${2:-}"
    session_file="${3:-}"
    if [ -z "$TAB_NAME" ] || [ -z "$session_file" ]; then
      echo "usage: agent-hook-bridge.sh autopilot <tab> <session_file>" >&2
      exit 2
    fi
    autopilot_dispatch_and_inject "$TAB_NAME" "$session_file"
    ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac
