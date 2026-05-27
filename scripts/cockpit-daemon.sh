#!/usr/bin/env bash
# cockpit-daemon.sh — polls the cloud control plane for pending commands and executes them locally.
#
# Usage:
#   COCKPIT_DAEMON_TOKEN=<secret> ./scripts/cockpit-daemon.sh
#
# Optional env vars:
#   COCKPIT_BASE_URL      — defaults to https://cockpitapp.vercel.app
#   COCKPIT_POLL_INTERVAL — long-poll wait for remote/Vercel endpoint (seconds), default 8
#   COCKPIT_DRY_RUN       — set to "1" to log commands without executing them
#
# The daemon authenticates via bearer token; the server finds the default user automatically.
# No user ID needed — the cloud determines which user's queue to drain.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source brand SSOT (APP_NAME, APP_SLUG, APP_DOMAIN, _brand_env, _brand_tmp).
# shellcheck source=_brand.sh
source "$SCRIPT_DIR/_brand.sh"

# Source shared zellij helpers (inject_prompt, etc.)
# shellcheck source=agent-hook-lib.sh
source "$SCRIPT_DIR/agent-hook-lib.sh" 2>/dev/null || {
  echo "[${APP_SLUG}-daemon] ERROR: cannot source agent-hook-lib.sh" >&2
  exit 1
}

# Source the bash-side agent definitions (derived from src/lib/agent-registry.ts — the real SSOT).
# shellcheck source=_agents.sh
source "$SCRIPT_DIR/_agents.sh" 2>/dev/null || true

_LOCAL_URL="http://localhost:3000"
_REMOTE_URL="$(_brand_env BASE_URL "https://${APP_DOMAIN}")"
POLL_INTERVAL="$(_brand_env POLL_INTERVAL 8)"
PUSH_INTERVAL="$(_brand_env PUSH_INTERVAL 2)"
DRY_RUN="$(_brand_env DRY_RUN 0)"
TOKEN="$(_brand_env DAEMON_TOKEN "")"
CONF_FILE="${AGENT_PROJECTS_CONF:-${CLAUDE_PROJECTS_CONF:-$HOME/.config/agent-projects.conf}}"
RESTART_AFTER_COMMAND=0
# Cache file shared between the main poll loop and the background push loop.
_URL_CACHE="$(_brand_tmp "daemon-url-$$")"
_AUTH_HEADER="$(_brand_tmp "daemon-auth-$$")"
_URL_TTL=30  # re-detect every 30 s

if [ -z "$TOKEN" ]; then
  echo "[${APP_SLUG}-daemon] ERROR: ${APP_SLUG^^}_DAEMON_TOKEN is not set" >&2
  exit 1
fi

umask 077
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$_AUTH_HEADER"

log() { echo "[${APP_SLUG}-daemon] $(date '+%H:%M:%S') $*"; }

# Hooks installed before the hosted helper lived in a separate cockpit-beacon
# directory. Keep that active hook target current so direct terminal use and
# the daemon read the same adapter registry.
sync_legacy_hook_runtime() {
  local hook_dir="$HOME/.local/share/${APP_SLUG}-beacon" file
  [ -d "$hook_dir" ] || return 0
  for file in _brand.sh _agents.sh agent-hook-lib.sh agent-hook-bridge.sh \
      beacon.py _beacon_config.py get-idle-secs.py notify-choice.py \
      run-codex-task.sh run-gemini-task.sh sync-agent-runtime-config.py; do
    [ -f "$SCRIPT_DIR/$file" ] || continue
    cp "$SCRIPT_DIR/$file" "$hook_dir/$file" 2>/dev/null || true
  done
  chmod +x "$hook_dir/agent-hook-bridge.sh" 2>/dev/null || true
}

# Returns the configured control plane by default. Development can explicitly
# opt into localhost with COCKPIT_DAEMON_PREFER_LOCAL=1.
# Result is cached in $_URL_CACHE for $_URL_TTL seconds so we don't probe on
# every 2-second push. The file is shared between the main process and the
# background push-loop subshell.
_base_url() {
  local now ts cached url
  now=$(date +%s)
  if [ -f "$_URL_CACHE" ]; then
    ts=$(cut -d' ' -f1 "$_URL_CACHE" 2>/dev/null)
    cached=$(cut -d' ' -f2 "$_URL_CACHE" 2>/dev/null)
    if [[ "$ts" =~ ^[0-9]+$ ]] && (( now - ts < _URL_TTL )) && [ -n "$cached" ]; then
      echo "$cached"; return
    fi
  fi
  # APP_DAEMON_FORCE_REMOTE=1 (or COCKPIT_DAEMON_FORCE_REMOTE=1 legacy) skips
  # the local probe entirely. Use this when a local dev server is running with
  # a different DB than the remote — without it, the daemon prefers local and
  # remote runtime state goes stale (the cloud control panel shows
  # daemonLastPushedAt frozen).
  if [ "$(_brand_env DAEMON_FORCE_REMOTE 0)" = "1" ] || [ "$(_brand_env DAEMON_PREFER_LOCAL 0)" != "1" ]; then
    url="$_REMOTE_URL"
  elif curl -sf --max-time 0.8 "$_LOCAL_URL/api/health" >/dev/null 2>&1; then
    url="$_LOCAL_URL"
  else
    url="$_REMOTE_URL"
  fi
  echo "$now $url" > "$_URL_CACHE"
  echo "$url"
}

# Warm the cache at startup, retrying briefly so the local app has time to boot.
_init_base_url() {
  if [ "$(_brand_env DAEMON_FORCE_REMOTE 0)" = "1" ] || [ "$(_brand_env DAEMON_PREFER_LOCAL 0)" != "1" ]; then
    echo "$(date +%s) $_REMOTE_URL" > "$_URL_CACHE"
    log "using configured control plane $_REMOTE_URL (local probing disabled)"
    return
  fi
  local i=0
  while (( i < 8 )); do
    if curl -sf --max-time 0.8 "$_LOCAL_URL/api/health" >/dev/null 2>&1; then
      echo "$(date +%s) $_LOCAL_URL" > "$_URL_CACHE"
      log "local server detected — using $_LOCAL_URL"
      # Loud warning: if the configured remote URL is a real production
      # endpoint (anything that isn't localhost / 127.0.0.1), the user
      # almost certainly has a deployed app + a local dev server running
      # side-by-side. Polling local means dispatches from the production
      # /control page never reach this daemon — they queue silently on
      # the remote DB. This exact trap cost a real session before the
      # warning was added.
      if [[ "$_REMOTE_URL" != *localhost* && "$_REMOTE_URL" != *127.0.0.1* ]]; then
        log "WARN: ${APP_SLUG^^}_BASE_URL=$_REMOTE_URL but daemon picked LOCAL —"
        log "WARN: dispatches from $_REMOTE_URL/control will NOT reach this daemon."
        log "WARN: set ${APP_SLUG^^}_DAEMON_FORCE_REMOTE=1 in your daemon.env to poll $_REMOTE_URL instead."
      fi
      return
    fi
    (( i++ )) || true
    sleep 1
  done
  echo "$(date +%s) $_REMOTE_URL" > "$_URL_CACHE"
  log "local server not available — using $_REMOTE_URL"
}

trap 'rm -f "$_URL_CACHE" "$_AUTH_HEADER"' EXIT

claim_next() {
  local base wait_secs
  base=$(_base_url)
  # Use a longer wait on local server (no Vercel function-timeout concern).
  # Fall back to POLL_INTERVAL for remote (stays within Vercel's 10s default).
  [[ "$base" == *"localhost"* ]] || [[ "$base" == *"127.0.0.1"* ]] \
    && wait_secs=25 || wait_secs="$POLL_INTERVAL"
  curl -sf --max-time 30 \
    -H "@$_AUTH_HEADER" \
    "${base}/api/control/commands?wait=${wait_secs}" 2>/dev/null
}

mark_done() {
  local id="$1" ok="$2" err="${3:-}"
  local body
  if [ -n "$err" ]; then
    body=$(printf '{"ok":%s,"error":%s}' "$ok" "$(printf '%s' "$err" | jq -Rs .)")
  else
    body=$(printf '{"ok":%s}' "$ok")
  fi
  curl -sf --max-time 10 -X PATCH \
    -H "@$_AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$(_base_url)/api/control/commands/$id" >/dev/null 2>&1 || true
}

# Returns 0 if user is actively typing in the given tab (marker file exists and is <60s old).
_is_user_typing_in_tab() {
  local tab="$1" now
  now=$(date +%s)
  for f in "$(_brand_tmp 'typing-')"*; do
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

# Resolve a promptKey to full prompt text with session context, mirroring
# buildPromptWithSession() in src/lib/agent-config.ts.
# Third arg is the adapter (grok | claude | ...); defaults to claude for back-compat.
_resolve_prompt() {
  local key="$1" tab="$2" adapter="${3:-claude}"
  local base
  base=$(get_prompt "$key" 2>/dev/null)
  [ -z "$base" ] && return 1

  # Use per-adapter session dir so grok tabs write to ~/.grok/sessions/ etc.
  # The lib provides _session_file if sourced (it is).
  local session_file
  if type _session_file >/dev/null 2>&1; then
    session_file="$(_session_file "$tab" "$adapter")"
  else
    # Fallback for very old installs
    session_file="$HOME/.claude/sessions/${tab}.md"
  fi

  local update_block
  update_block="When done, update ${session_file} with exactly these lines:
status: <ready | working>     # 'ready' = task fully done; 'working' = more to do. Auto-inject only fires when 'ready'.
last-3-same-dir: <yes | no>   # whether the last 3 commits all modify one directory
wip-or-revert-in-last-5: <yes | no>   # whether a recent commit subject begins with WIP or revert
tsc: <pass | fail(N)>
lint: <pass | fail(N errors, M warnings)>
tests: <N pass · N fail, or 'no suite'>
todos: <count from TODO/FIXME/HACK scan>
done: <one sentence what you completed>
next: <state to resume from; empty when nothing is mid-flight>"

  if [ -f "$session_file" ]; then
    printf '%s\n\nSession state from last run:\n%s\n\n%s' \
      "$base" "$(cat "$session_file")" "$update_block"
  else
    printf '%s\n\nBefore stopping, create %s.\n%s' \
      "$base" "$session_file" "$update_block"
  fi
}

execute_inject() {
  local id="$1" tab="$2" prompt="$3" prompt_key="${4:-}" prompt_label="${5:-}"

  # Look up the project's declared adapter (from agent-projects.conf 3rd field)
  # so we tell the agent to write its handoff to the right per-adapter session dir.
  local adapter="claude"
  if type resolve_adapter >/dev/null 2>&1; then
    TAB_NAME="$tab"
    resolve_adapter 2>/dev/null || true
    adapter="${ADAPTER:-claude}"
  fi

  # If a promptKey was queued (cloud mode sends key string as prompt fallback),
  # resolve it to the actual expanded prompt text with session context.
  if [ -n "$prompt_key" ]; then
    local resolved
    resolved=$(_resolve_prompt "$prompt_key" "$tab" "$adapter" 2>/dev/null) || true
    [ -n "$resolved" ] && prompt="$resolved"
  fi
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

  # Write session lifecycle sentinel files so the stop hook transitions the UI
  # correctly — mirroring what /api/orchestration/run and /api/inject do locally.
  local now_s
  now_s=$(date +%s)
  if [ "$prompt_key" = "hard_stop" ] || [ "$prompt_key" = "close_session" ]; then
    # Clear stale ready/closed state (mirrors clearHandshakeFiles in the API).
    # Use original-case tab name — the stop hook and push_runtime_state both read
    # these paths with ${TAB_NAME} / ${tab} which preserves the zellij/conf casing.
    rm -f "/tmp/agent-ready-${tab}" "/tmp/claude-ready-${tab}"
    rm -f "/tmp/agent-closed-${tab}" "/tmp/claude-closed-${tab}"
    # Sentinel tells the stop hook to write closedAt instead of showing the beacon.
    : > "/tmp/agent-session-closed-${tab}"
    echo "$now_s" > "/tmp/agent-closing-${tab}"
    if [ "$prompt_key" = "hard_stop" ]; then
      echo "$now_s" > "/tmp/agent-closed-${tab}"
    fi
  else
    # Non-lifecycle dispatch: clear any stale closing sentinel so the UI doesn't
    # stay in "Closing…" state. Mirrors /api/inject and /api/orchestration/run.
    rm -f "/tmp/agent-closing-${tab}" "/tmp/claude-closing-${tab}"
    # Cancel any open web-beacon popup for this tab (mirrors cancelActiveBeaconSessions).
    # Sets choice:"" so the React beacon client knows to self-close.
    local _bdir="$(_brand_tmp 'beacon')"
    if [ -d "$_bdir" ]; then
      for _bf in "$_bdir"/*.json; do
        [ -f "$_bf" ] || continue
        _proj=$(jq -r '.project // empty' "$_bf" 2>/dev/null)
        _choice=$(jq -r '.choice' "$_bf" 2>/dev/null)
        if [ "$_proj" = "$tab" ] && [ "$_choice" = "null" ]; then
          jq '.choice = ""' "$_bf" > "${_bf}.tmp" 2>/dev/null && mv "${_bf}.tmp" "$_bf" 2>/dev/null || true
        fi
      done
    fi
  fi

  log "inject → tab=$tab"

  # Robustness fix for "any retard" experience (including custom prompts from the web UI,
  # old server templates that defaulted to Claude, or mixed adapter usage).
  # The daemon is the only thing that has the local agent-projects.conf.
  # We always guarantee the agent is told to write its handoff to the correct
  # per-adapter file for this tab, no matter what the cloud sent us.
  local correct_handoff_file
  if type _session_file >/dev/null 2>&1; then
    correct_handoff_file="$(_session_file "$tab" "$adapter")"
  else
    correct_handoff_file="$HOME/.claude/sessions/${tab}.md"
  fi

  # Append a clear, high-priority handoff instruction. This overrides any stale
  # Claude-path instructions that might have come from the server or previous context.
  prompt="$prompt

[MANDATORY HANDOFF — DO THIS BEFORE YOU STOP]
When you finish the current task (or need to hand off), write your final status to this exact file:
$correct_handoff_file

Use exactly this format (one field per line):
status: ready | working     # 'ready' = fully done; auto-inject may fire. 'working' = more to do.
done: <one clear sentence of what you accomplished in this turn>
next: <precise next step or exact state to resume from>
tests: <N pass · N fail, or 'no suite'>
todos: <count of open TODO/FIXME/HACK items>
health: good | needs attention | critical
last-3-same-dir: yes | no
wip-or-revert-in-last-5: yes | no
tsc: pass | fail(N)
lint: pass | fail(N errors, M warnings)
"

  if inject_prompt "$tab" "$prompt" 2>/dev/null; then
    mark_done "$id" "true"
    log "inject done ✓"
    # Write current-prompt file so the UI shows the running banner.
    # Skipped for lifecycle intents (hard_stop/close_session) — those are ending,
    # not starting, a tracked prompt. Mirrors what the local inject/run routes write.
    if [ "$prompt_key" != "hard_stop" ] && [ "$prompt_key" != "close_session" ]; then
      local cp_label="${prompt_label:-${prompt_key:-custom}}"
      local cp_key="${prompt_key:-custom}"
      local now_s
      now_s=$(date +%s)
      printf '{"key":%s,"label":%s,"startedAt":%s,"source":"inject","adapter":%s}' \
        "$(printf '%s' "$cp_key"   | jq -Rs .)" \
        "$(printf '%s' "$cp_label" | jq -Rs .)" \
        "$now_s" \
        "$(printf '%s' "$adapter" | jq -Rs .)" \
        > "/tmp/agent-current-prompt-${tab}"
    fi
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

  local session
  session=$(_find_session_for_tab "$tab" 2>/dev/null || true)
  log "focus_tab → $tab"
  if [ -n "$session" ] && ZELLIJ_SESSION_NAME="$session" zellij action go-to-tab-name "$tab" 2>/dev/null; then
    mark_done "$id" "true"
    log "focus_tab done ✓"
  else
    mark_done "$id" "false" "go-to-tab-name failed"
    log "focus_tab failed ✗"
  fi
}

execute_close_tab() {
  local id="$1" tab="$2" session
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN close_tab → $tab"
    mark_done "$id" "true"
    return 0
  fi
  session=$(_find_session_for_tab "$tab" 2>/dev/null || true)
  if [ -z "$session" ]; then
    mark_done "$id" "false" "tab not found"
    return 0
  fi
  log "close_tab → $tab"
  ZELLIJ_SESSION_NAME="$session" zellij action go-to-tab-name "$tab" 2>/dev/null || true
  sleep 0.15
  if ZELLIJ_SESSION_NAME="$session" zellij action close-tab 2>/dev/null; then
    mark_done "$id" "true"
    log "close_tab done ✓"
  else
    mark_done "$id" "false" "close-tab failed"
    log "close_tab failed ✗"
  fi
}

execute_launch_agent() {
  local id="$1" tab="$2" dir="$3" agent="$4" model="${5:-}" initial_prompt="${6:-}"
  local session command
  command=$(_agent_launch_cmd "$agent" "$dir" "$model")
  if [ -z "$command" ]; then
    mark_done "$id" "false" "unknown agent: $agent"
    return 0
  fi
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN launch_agent → tab=$tab agent=$agent"
    mark_done "$id" "true"
    return 0
  fi
  session=$(_find_session_for_tab "$tab" 2>/dev/null || true)
  if [ -z "$session" ]; then
    session=$(zellij list-sessions -n 2>/dev/null | awk 'NR==1{print $1}')
    [ -z "$session" ] && { mark_done "$id" "false" "no zellij session found"; return 0; }
    ZELLIJ_SESSION_NAME="$session" zellij action new-tab --name "$tab" 2>/dev/null || {
      mark_done "$id" "false" "new-tab failed"; return 0;
    }
    sleep 0.5
  fi
  log "launch_agent → tab=$tab agent=$agent"
  if inject_prompt "$tab" "$command" 2>/dev/null; then
    if [ -n "$initial_prompt" ]; then
      sleep 2
      inject_prompt "$tab" "$initial_prompt" 2>/dev/null || true
    fi
    mark_done "$id" "true"
    log "launch_agent done ✓"
  else
    mark_done "$id" "false" "agent launch injection failed"
    log "launch_agent failed ✗"
  fi
}

# Returns the quit command for an agent, or empty string if unknown.
_agent_quit_cmd() {
  local agent="$1"
  echo "${AGENT_QUIT_CMD[$agent]:-}"
}

# Returns the shell command to launch an agent in a directory.
# Delegates to the single definition in _agents.sh (the bash mirror of the registry).

# Returns 0 (true) if any process matching the agent's basename is running with
# a cwd equal to or inside dir; 1 otherwise. Delegates to _scan_agents so the
# /proc walking logic lives in exactly one place.
_is_agent_running_in_dir() {
  local agent="$1" dir="$2"
  local found
  found=$(_scan_agents 2>/dev/null | while IFS=' ' read -r cwd aname; do
    [ "$aname" = "$agent" ] || continue
    if [ "$cwd" = "$dir" ] || [ "${cwd#"${dir}/"}" != "$cwd" ]; then
      echo "1"; break
    fi
  done)
  [ "$found" = "1" ]
}

execute_switch_agent() {
  local id="$1" tab="$2" dir="$3" to_agent="$4" from_agent="${5:-}" model="${6:-}"

  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN switch_agent → tab=$tab from=${from_agent:-?} to=$to_agent"
    mark_done "$id" "true"
    return 0
  fi

  local launch_cmd
  launch_cmd=$(_agent_launch_cmd "$to_agent" "$dir" "$model")
  if [ -z "$launch_cmd" ]; then
    mark_done "$id" "false" "unknown agent: $to_agent"
    log "switch_agent failed — unknown agent: $to_agent ✗"
    return 0
  fi

  log "switch_agent → tab=$tab from=${from_agent:-?} to=$to_agent"

  if [ -n "$from_agent" ] && [ "$from_agent" != "$to_agent" ]; then
    local quit_cmd
    quit_cmd=$(_agent_quit_cmd "$from_agent")
    if [ -n "$quit_cmd" ]; then
      inject_prompt "$tab" "$quit_cmd" 2>/dev/null || true

      local gone=0 deadline
      deadline=$(( $(date +%s) + 2 ))
      while (( $(date +%s) < deadline )); do
        sleep 0.3
        if ! _is_agent_running_in_dir "$from_agent" "$dir"; then
          gone=1; break
        fi
      done

      if [ "$gone" = "0" ]; then
        log "switch_agent: quit didn't land, sending Ctrl+C to $tab"
        send_raw_key_to_tab "$tab" 3 2>/dev/null || true
        sleep 0.6
      fi
    fi
  fi

  if inject_prompt "$tab" "$launch_cmd" 2>/dev/null; then
    mark_done "$id" "true"
    log "switch_agent done ✓ ($from_agent → $to_agent)"
  else
    mark_done "$id" "false" "inject launch command failed"
    log "switch_agent failed ✗"
  fi
}

execute_auto_continue() {
  local id="$1" tab="$2" enabled="$3"
  local sentinel="/tmp/${APP_SLUG}-auto-continue-${tab,,}"

  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN auto_continue → tab=$tab enabled=$enabled"
    mark_done "$id" "true"
    return 0
  fi

  log "auto_continue → tab=$tab enabled=$enabled"
  if [ "$enabled" = "true" ]; then
    rm -f "$sentinel" 2>/dev/null || true
  else
    echo "off" > "$sentinel"
  fi
  mark_done "$id" "true"
  log "auto_continue done ✓"
}

# One-click install flow support.
# When the web UI triggers "Install Grok" etc., the daemon creates a fresh zellij tab
# and injects the official installer command so the user can just follow along.
execute_install_cli() {
  local id="$1" agent="$2"

  local cmd="${AGENT_INSTALL_CMD[$agent]:-}"
  if [ -z "$cmd" ]; then
    mark_done "$id" "false" "unknown agent for install: $agent"
    log "install_cli failed — unknown agent $agent"
    return 0
  fi

  # Human label
  local label
  case "$agent" in
    grok)    label="Grok" ;;
    claude)  label="Claude" ;;
    codex)   label="Codex" ;;
    gemini)  label="Gemini" ;;
    cursor)  label="Cursor" ;;
    openclaw) label="OpenClaw" ;;
    *) label="$agent" ;;
  esac

  log "install_cli → $agent ($label)"

  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN install_cli → $agent : $cmd"
    mark_done "$id" "true"
    return 0
  fi

  # Find a zellij session the user is likely using
  local session
  session=$(zellij list-sessions -n 2>/dev/null | awk 'NR==1{print $1}')
  if [ -z "$session" ]; then
    mark_done "$id" "false" "no zellij session found to open installer tab"
    log "install_cli failed — no zellij session"
    return 0
  fi

  local tab_name="Install $label"

  # Create a fresh tab for the installer (user can close it when done)
  ZELLIJ_SESSION_NAME="$session" zellij action new-tab --name "$tab_name" 2>/dev/null || true
  sleep 0.6

  # Inject the install command
  if inject_prompt "$tab_name" "$cmd" 2>/dev/null; then
    mark_done "$id" "true"
    log "install_cli done ✓ (tab '$tab_name' opened with installer)"
  else
    mark_done "$id" "false" "failed to create tab or inject installer command"
    log "install_cli failed to inject into new tab"
  fi
}

# Pull the latest hosted helper bundle in place. This is deliberately a daemon
# command: once enrolled, the user repairs or upgrades from the web UI.
execute_repair_helper() {
  local id="$1" install_dir="$HOME/.local/share/$APP_SLUG" tmp tarball
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN repair_helper"
    mark_done "$id" "true"
    return 0
  fi
  tmp=$(mktemp -d "/tmp/${APP_SLUG}-repair-XXXXXX")
  tarball="$tmp/helper.tar.gz"
  log "repair_helper → downloading latest helper bundle"
  if ! curl -fsS --max-time 30 "$(_base_url)/api/agent/daemon" -o "$tarball" \
      || ! mkdir -p "$install_dir" \
      || ! tar -xzf "$tarball" -C "$install_dir"; then
    rm -rf "$tmp"
    mark_done "$id" "false" "failed to download or extract helper bundle"
    log "repair_helper failed ✗"
    return 0
  fi
  chmod +x "$install_dir/cockpit-daemon.sh" "$install_dir/cockpit" \
    "$install_dir/agent-hook-bridge.sh" "$install_dir/install-daemon.sh" 2>/dev/null || true
  rm -rf "$tmp"
  sync_legacy_hook_runtime
  mark_done "$id" "true"
  log "repair_helper installed ✓ — restarting runtime"
  RESTART_AFTER_COMMAND=1
}

execute_transcription() {
  local id="$1" audio_b64="$2" mime_type="$3"
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY RUN transcribe id=$id"
    curl -sf -X PATCH \
      -H "@$_AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d '{"ok":true,"text":"dry run transcription"}' \
      "$(_base_url)/api/control/commands/$id" >/dev/null 2>&1 || true
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
    -H "@$_AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$(_base_url)/api/control/commands/$id" >/dev/null 2>&1 || true
  log "transcribe done ✓ (${#transcription} chars)"
}

# ── Runtime state push ────────────────────────────────────────────────────────
# _build_state_json reads /proc + /tmp and outputs the runtime-state JSON to stdout.
# push_runtime_state calls it and POSTs immediately (used after command execution).
# _push_loop calls it every PUSH_INTERVAL seconds but only POSTs when the hash changes.

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

# Scan /proc once; output lines of "<cwd> <agent_id>" for all running agents.
# Uses the single definition in _agents.sh.
_scan_agents() {
  for pd in /proc/[0-9]*/; do
    pd="${pd%/}"
    [ -f "$pd/cmdline" ] || continue
    local argv0 basename agent_id
    argv0=$(tr '\0' '\n' < "$pd/cmdline" 2>/dev/null | head -1) || continue
    basename="${argv0##*/}"

    # Check known agents from the centralized table
    for a in "${AGENTS[@]}"; do
      local expected="${AGENT_PROCESS_NAMES[$a]}"
      if [ "$basename" = "$expected" ]; then
        if [ "$a" = "cursor" ]; then
          _is_cursor_agent "$basename" "$argv0" || continue
        fi
        agent_id="$a"
        break
      fi
    done

    [ -z "$agent_id" ] && continue

    local cwd
    cwd=$(readlink "$pd/cwd" 2>/dev/null) || continue
    echo "$cwd $agent_id"
  done
}

_build_state_json() {
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

    # Check if this project's Zellij tab is actually open (case-insensitive exact line)
    local tab_open="false"
    if echo "$all_open_tabs" | grep -qixF "$tab"; then
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

    # Session file content (done/next/tests/todos/health) — read and push so the cloud
    # control plane shows current session state without needing a local server connection.
    # Use the per-adapter path declared in the projects conf (or default claude).
    local adapter="claude"
    if type resolve_adapter >/dev/null 2>&1; then
      TAB_NAME="$tab"
      resolve_adapter 2>/dev/null || true
      adapter="${ADAPTER:-claude}"
    fi
    # Adapters may expose a project-scoped native activity feed for work typed
    # directly in the CLI. Only upload a short label and timestamp, never log
    # content; web-dispatched prompts and hook lifecycle work for every adapter.
    if [ "$tab_open" = "true" ] && [ -z "$cpk" ] && type _agent_direct_activity >/dev/null 2>&1; then
      local activity observation_mtime observation_label observation_age
      activity=$(_agent_direct_activity "$adapter" "$dir" 2>/dev/null || true)
      observation_mtime="${activity%%|*}"
      observation_label="${activity#*|}"
      if [ -n "$activity" ] && [[ "$observation_mtime" =~ ^[0-9]+$ ]]; then
        observation_age=$(( $(date +%s) - observation_mtime ))
        if [ "$observation_age" -ge 0 ] && [ "$observation_age" -lt 45 ]; then
          cpk="direct_terminal"
          cpl="$observation_label"
          cpsat="$observation_mtime"
          agents_json=$(jq -nc --arg a "$adapter" '[$a]')
          running="true"
        fi
      fi
    fi
    # A stop/notification hook is authoritative evidence of the configured
    # agent in this open tab even when the CLI launches through a wrapper whose
    # process basename is not recognized by /proc scanning.
    if [ "$tab_open" = "true" ] && [ "$agents_json" = "[]" ] && [ "$ready_at" != "null" ]; then
      local ready_age
      ready_age=$(( $(date +%s) - ready_at ))
      if [ "$ready_age" -ge 0 ] && [ "$ready_age" -lt 900 ]; then
        agents_json=$(jq -nc --arg a "$adapter" '[$a]')
        running="true"
      fi
    fi
    local sf
    if type _session_file >/dev/null 2>&1; then
      sf="$(_session_file "$tab" "$adapter")"
    else
      sf="$HOME/.claude/sessions/${tab}.md"
    fi
    local sess_status="" sess_done="" sess_next="" sess_tests="" sess_todos="" sess_health="" sess_mtime="null"
    if [ -f "$sf" ]; then
      sess_status=$(grep '^status:' "$sf" 2>/dev/null | head -1 | sed 's/^status:[[:space:]]*//')
      sess_done=$(grep  '^done:'   "$sf" 2>/dev/null | head -1 | sed 's/^done:[[:space:]]*//')
      sess_next=$(grep  '^next:'   "$sf" 2>/dev/null | head -1 | sed 's/^next:[[:space:]]*//')
      sess_tests=$(grep '^tests:'  "$sf" 2>/dev/null | head -1 | sed 's/^tests:[[:space:]]*//')
      sess_todos=$(grep '^todos:'  "$sf" 2>/dev/null | head -1 | sed 's/^todos:[[:space:]]*//')
      sess_health=$(grep '^health:' "$sf" 2>/dev/null | head -1 | sed 's/^health:[[:space:]]*//')
      local mts
      mts=$(stat -c '%Y' "$sf" 2>/dev/null || true)
      [[ "$mts" =~ ^[0-9]+$ ]] && sess_mtime="$mts"
    fi

    # Stale-prompt cleanup: Codex has no Stop hook (interactive TUI), so
    # /tmp/agent-current-prompt-<tab> lingers indefinitely after the agent
    # returns to idle. Without this gate the control UI shows "Codex working
    # 61h" on dead tabs. Two signals fire the cleanup: (1) the session file
    # was rewritten after the prompt started — the agent wrote a handoff so
    # the cycle closed; (2) the prompt is older than 30 min (hard cap for
    # agents that never write a session file).
    if [ "$cpsat" != "null" ]; then
      local _now_s
      _now_s=$(date +%s)
      if { [ "$sess_mtime" != "null" ] && [ "$sess_mtime" -gt "$((cpsat + 5))" ]; } \
         || [ "$((_now_s - cpsat))" -gt 1800 ]; then
        rm -f "$pf"
        cpk="" cpl="" cpsat="null"
      fi
    elif [ -f "$pf" ]; then
      # Belt-and-suspenders: the file exists but cpsat parsed as "null". That
      # means jq rejected the JSON (e.g. unescaped newlines in label — fixed
      # at the write site in agent-hook-lib.sh but legacy stale files may
      # remain). If the file mtime is older than 30 min, sweep it — there's
      # no startedAt to gate on, so use the filesystem timestamp as the
      # staleness signal. Stale-by-corruption files never become live again.
      local _pf_mtime _now_s
      _pf_mtime=$(stat -c '%Y' "$pf" 2>/dev/null || echo 0)
      _now_s=$(date +%s)
      if [ "$((_now_s - _pf_mtime))" -gt 1800 ]; then
        rm -f "$pf"
      fi
    fi

    local proj
    proj=$(jq -n \
      --arg      tab       "$tab" \
      --argjson  running   "$running" \
      --argjson  tab_open  "$tab_open" \
      --argjson  agents    "$agents_json" \
      --arg      cpk       "$cpk" \
      --arg      cpl       "$cpl" \
      --argjson  cpsat     "$cpsat" \
      --argjson  ready     "$ready_at" \
      --argjson  lock      "$lock_at" \
      --argjson  closing   "$closing_at" \
      --argjson  closed    "$closed_at" \
      --arg      sdone     "$sess_done" \
      --arg      sstatus   "$sess_status" \
      --arg      snext     "$sess_next" \
      --arg      stests    "$sess_tests" \
      --arg      stodos    "$sess_todos" \
      --arg      shealth   "$sess_health" \
      --argjson  smtime    "$sess_mtime" \
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
      }
      + (if $smtime == null then {} else {
        sessionStatus:    $sstatus,
        sessionDone:      $sdone,
        sessionNext:      $snext,
        sessionTests:     $stests,
        sessionTodos:     $stodos,
        sessionHealth:    $shealth,
        sessionUpdatedAt: ($smtime | tonumber)
      } end)' 2>/dev/null) || continue
    projects_arr=$(echo "$projects_arr" | jq ". + [$proj]" 2>/dev/null || echo "$projects_arr")

  done < "$CONF_FILE"

  echo "{\"projects\":$projects_arr,\"openTabs\":$(printf '%s\n' "$all_open_tabs" | sed '/^[[:space:]]*$/d' | sort -fu | jq -R . | jq -s . 2>/dev/null || echo '[]')}"
}

# Push the current runtime state to the API immediately.
# Used after command execution so the UI reflects the result without waiting for the push loop.
push_runtime_state() {
  local _s _status
  _s=$(_build_state_json 2>/dev/null) || return
  [ -z "$_s" ] && return
  _status=$(curl -sS --max-time 8 -X POST \
    -H "@$_AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$_s" \
    -o /dev/null -w '%{http_code}' \
    "$(_base_url)/api/control/runtime-state" 2>/dev/null) || _status="network-error"
  if [ "$_status" != "200" ]; then
    if [ "$_status" = "401" ]; then
      log "runtime-state push unauthorized (HTTP 401) - renew the Agent token in Settings and restart the daemon"
    else
      log "runtime-state push failed (HTTP $_status)"
    fi
  fi
}

_push_loop() {
  local _last_hash=""
  local _last_push_ts=0
  local _last_error_status=""
  local _last_error_ts=0
  # Heartbeat: even when the state hash is unchanged, force a push every
  # HEARTBEAT_S so the cloud UI's "daemon offline" threshold (90 s in
  # ControlPanel.tsx:daemonOffline) never trips on a healthy idle daemon.
  # 60 s comfortably stays under that 90 s window with one missed-push slack.
  local _heartbeat_s="$(_brand_env DAEMON_HEARTBEAT_S 60)"
  while true; do
    local _s _h _now _age _status
    _s=$(_build_state_json 2>/dev/null) || true
    if [ -n "$_s" ]; then
      _h=$(printf '%s' "$_s" | md5sum | cut -d' ' -f1)
      _now=$(date +%s)
      _age=$(( _now - _last_push_ts ))
      if [ "$_h" != "$_last_hash" ] || [ "$_age" -ge "$_heartbeat_s" ]; then
        _status=$(curl -sS --max-time 8 -X POST \
          -H "@$_AUTH_HEADER" \
          -H "Content-Type: application/json" \
          -d "$_s" \
          -o /dev/null -w '%{http_code}' \
          "$(_base_url)/api/control/runtime-state" 2>/dev/null) || _status="network-error"
        if [ "$_status" = "200" ]; then
          _last_hash="$_h"
          _last_push_ts="$_now"
          _last_error_status=""
        elif [ "$_status" != "$_last_error_status" ] || [ "$(( _now - _last_error_ts ))" -ge 60 ]; then
          if [ "$_status" = "401" ]; then
            log "runtime-state push unauthorized (HTTP 401) - renew the Agent token in Settings and restart the daemon"
          else
            log "runtime-state push failed (HTTP $_status)"
          fi
          _last_error_status="$_status"
          _last_error_ts="$_now"
        fi
      fi
    fi
    sleep "$PUSH_INTERVAL"
  done
}

sync_legacy_hook_runtime
_init_base_url
# A former UI toggle used a local sleep sentinel outside persisted policy.
# It is no longer authoritative; discard any stranded value during upgrade.
rm -f "/tmp/cockpit-sleep-mode" 2>/dev/null || true
log "starting — long-polling $(_base_url) (local wait=25s, remote wait=${POLL_INTERVAL}s), pushing state on change (max every ${PUSH_INTERVAL}s)"
_push_loop &
_PUSH_PID=$!
trap 'kill "$_PUSH_PID" 2>/dev/null; rm -f "$_URL_CACHE" "$_AUTH_HEADER"; exit' INT TERM

while true; do
  # Local maintenance pause support.
  if [ -f "/tmp/cockpit-pause" ]; then
    sleep 30
    continue
  fi

  # claim_next long-polls — returns immediately on command or after wait timeout.
  # Only sleep on curl error (server unreachable) to avoid hammering a dead endpoint.
  response=$(claim_next) || { sleep 1; continue; }

  command_json=$(echo "$response" | jq -c '.command // empty' 2>/dev/null)
  [ -z "$command_json" ] && continue

  id=$(echo "$command_json" | jq -r '.id')
  type=$(echo "$command_json" | jq -r '.type')
  payload=$(echo "$command_json" | jq -c '.payload')

  case "$type" in
    inject)
      tab=$(echo "$payload" | jq -r '.tab')
      prompt=$(echo "$payload" | jq -r '.prompt')
      prompt_key=$(echo "$payload" | jq -r '.promptKey // empty')
      prompt_label=$(echo "$payload" | jq -r '.promptLabel // empty')
      run_id=$(echo "$payload" | jq -r '.runId // empty')
      # Mirror the local-mode sentinel write so agent-hook-bridge.sh:handle_stop
      # can post the captured handoff back to /api/orchestration/runs/<id>/finish.
      # In cloud mode the run row was created on the server side; here we just
      # land the id where the stop hook expects to read it.
      if [ -n "$run_id" ]; then
        printf '%s' "$run_id" > "$(_brand_tmp "run-${tab}")"
      fi
      execute_inject "$id" "$tab" "$prompt" "$prompt_key" "$prompt_label"
      ;;
    focus_tab)
      tab=$(echo "$payload" | jq -r '.tab')
      execute_focus_tab "$id" "$tab"
      ;;
    close_tab)
      tab=$(echo "$payload" | jq -r '.tab')
      execute_close_tab "$id" "$tab"
      ;;
    launch_agent)
      tab=$(echo "$payload" | jq -r '.tab')
      dir=$(echo "$payload" | jq -r '.dir')
      agent=$(echo "$payload" | jq -r '.agent')
      model=$(echo "$payload" | jq -r '.model // empty')
      initial_prompt=$(echo "$payload" | jq -r '.initialPrompt // empty')
      execute_launch_agent "$id" "$tab" "$dir" "$agent" "$model" "$initial_prompt"
      ;;
    switch_agent)
      tab=$(echo "$payload" | jq -r '.tab')
      dir=$(echo "$payload" | jq -r '.dir')
      to_agent=$(echo "$payload" | jq -r '.toAgent')
      from_agent=$(echo "$payload" | jq -r '.fromAgent // empty')
      model=$(echo "$payload" | jq -r '.model // empty')
      execute_switch_agent "$id" "$tab" "$dir" "$to_agent" "$from_agent" "$model"
      ;;
    transcribe)
      audio_b64=$(echo "$payload" | jq -r '.audio_b64')
      mime_type=$(echo "$payload" | jq -r '.mime_type // "audio/webm"')
      execute_transcription "$id" "$audio_b64" "$mime_type"
      ;;
    auto_continue)
      tab=$(echo "$payload" | jq -r '.tab')
      enabled=$(echo "$payload" | jq -r '.enabled')
      execute_auto_continue "$id" "$tab" "$enabled"
      ;;
    install_cli)
      agent=$(echo "$payload" | jq -r '.agent')
      execute_install_cli "$id" "$agent"
      ;;
    repair_helper)
      execute_repair_helper "$id"
      ;;
    *)
      log "unknown command type: $type — marking done"
      mark_done "$id" "false" "unknown type: $type"
      ;;
  esac

  # Push updated state immediately so the UI reflects the execution result.
  push_runtime_state &
  if [ "$RESTART_AFTER_COMMAND" = "1" ]; then
    kill "$_PUSH_PID" 2>/dev/null || true
    rm -f "$_URL_CACHE" "$_AUTH_HEADER"
    exec "$HOME/.local/share/$APP_SLUG/cockpit-daemon.sh"
  fi
done
