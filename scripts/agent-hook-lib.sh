#!/bin/bash
# Shared utilities for local agent hooks.
# This file is Cockpit-owned so runtime glue can remain thin in dotfiles.

_CONF="${AGENT_PROJECTS_CONF:-${CLAUDE_PROJECTS_CONF:-$HOME/.config/agent-projects.conf}}"
_PROMPTS="${AGENT_PROMPTS_FILE:-${CLAUDE_PROMPTS:-$HOME/.config/agent-prompts.json}}"
_DBUS="unix:path=/run/user/$(id -u)/bus"

resolve_tab() {
  TAB_NAME=""
  local cwd
  cwd=$(realpath "$1" 2>/dev/null)

  local actual_tabs
  actual_tabs=$(zellij action query-tab-names 2>/dev/null)
  [ -z "$actual_tabs" ] && return

  if [ -n "${AGENT_TAB_NAME:-}" ]; then
    local requested_tab
    requested_tab=$(printf '%s\n' "$actual_tabs" | while IFS= read -r t; do
      [ "${t,,}" = "${AGENT_TAB_NAME,,}" ] && printf '%s' "$t" && break
    done)
    if [ -n "$requested_tab" ]; then
      TAB_NAME="$requested_tab"
      return
    fi
  fi

  # Fast path: pane identity file written by the claude() wrapper at launch time.
  # ZELLIJ_PANE_ID is inherited from the zellij environment by Claude and its subprocesses.
  # This is the most reliable resolution path when multiple tabs share the same directory.
  local pane_id="${ZELLIJ_PANE_ID:-}"
  if [ -n "$pane_id" ] && [ -f "/tmp/claude-pane-${pane_id}" ]; then
    local pane_tab
    pane_tab=$(cat "/tmp/claude-pane-${pane_id}" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$pane_tab" ]; then
      local match
      match=$(printf '%s\n' "$actual_tabs" | while IFS= read -r t; do
        [ "${t,,}" = "${pane_tab,,}" ] && printf '%s' "$t" && break
      done)
      if [ -n "$match" ]; then
        TAB_NAME="$match"
        return
      fi
    fi
  fi

  local shell_pid
  shell_pid=$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ')
  if [ -n "$shell_pid" ]; then
    if [ -f "/tmp/agent-tab-${shell_pid}" ]; then
      TAB_NAME=$(cat "/tmp/agent-tab-${shell_pid}" 2>/dev/null)
      [ -n "$TAB_NAME" ] && return
    elif [ -f "/tmp/claude-tab-${shell_pid}" ]; then
      TAB_NAME=$(cat "/tmp/claude-tab-${shell_pid}" 2>/dev/null)
      [ -n "$TAB_NAME" ] && return
    fi
  fi

  local zellij_pid our_pane_id
  if [ -n "$shell_pid" ] && [ -n "$cwd" ]; then
    zellij_pid=$(ps -o ppid= -p "$shell_pid" 2>/dev/null | tr -d ' ')
    our_pane_id=$(tr '\0' '\n' < /proc/"$shell_pid"/environ 2>/dev/null \
      | grep '^ZELLIJ_PANE_ID=' | cut -d= -f2)

    if [ -n "$our_pane_id" ] && [ -n "$zellij_pid" ]; then
      local group_idx
      group_idx=$(
        ps -o pid= --ppid "$zellij_pid" 2>/dev/null | while read -r p; do
          local pid_pane pid_cwd
          pid_pane=$(tr '\0' '\n' < /proc/"$p"/environ 2>/dev/null \
            | grep '^ZELLIJ_PANE_ID=' | cut -d= -f2)
          [ -z "$pid_pane" ] && continue
          pid_cwd=$(realpath "$(readlink /proc/"$p"/cwd 2>/dev/null)" 2>/dev/null)
          [ "$pid_cwd" = "$cwd" ] || continue
          printf '%s\n' "$pid_pane"
        done | sort -n | grep -n "^${our_pane_id}$" | cut -d: -f1
      )

      if [ -n "$group_idx" ]; then
        local same_cwd_tabs
        same_cwd_tabs=$(
          printf '%s\n' "$actual_tabs" | while IFS= read -r t; do
            local t_lower="${t,,}" found=0
            while IFS='|' read -r ctab cdir; do
              [[ "$ctab" =~ ^#.*$ || -z "$ctab" ]] && continue
              [ "${ctab,,}" = "$t_lower" ] || continue
              local rdir
              rdir=$(realpath "$cdir" 2>/dev/null) || continue
              if [ "$rdir" = "$cwd" ]; then found=1; break; fi
            done < "$_CONF"
            [ "$found" -eq 1 ] && printf '%s\n' "$t"
          done
        )

        local name
        name=$(printf '%s\n' "$same_cwd_tabs" | sed -n "${group_idx}p")
        if [ -n "$name" ]; then
          TAB_NAME="$name"
          return
        fi
      fi

      local global_idx
      global_idx=$(
        ps -o pid= --ppid "$zellij_pid" 2>/dev/null | while read -r p; do
          local pid_pane
          pid_pane=$(tr '\0' '\n' < /proc/"$p"/environ 2>/dev/null \
            | grep '^ZELLIJ_PANE_ID=' | cut -d= -f2)
          [ -z "$pid_pane" ] && continue
          printf '%s\n' "$pid_pane"
        done | sort -n | grep -n "^${our_pane_id}$" | cut -d: -f1
      )
      if [ -n "$global_idx" ]; then
        local name
        name=$(printf '%s\n' "$actual_tabs" | sed -n "${global_idx}p")
        if [ -n "$name" ]; then
          TAB_NAME="$name"
          return
        fi
      fi
    fi
  fi

  [ -z "$cwd" ] && return
  [ -f "$_CONF" ] || return

  local exact_count=0 exact_match="" sw_count=0 sw_match=""
  while IFS='|' read -r tab dir; do
    [[ "$tab" =~ ^#.*$ || -z "$tab" ]] && continue
    local rdir
    rdir=$(realpath "$dir" 2>/dev/null) || continue
    [ "$rdir" != "$cwd" ] && continue

    local tab_lower="${tab,,}"
    local actual
    actual=$(printf '%s\n' "$actual_tabs" | while IFS= read -r t; do
      [ "${t,,}" = "$tab_lower" ] && printf '%s' "$t" && break
    done)
    if [ -n "$actual" ]; then
      exact_count=$(( exact_count + 1 ))
      exact_match="$actual"
      continue
    fi

    local sw
    sw=$(printf '%s\n' "$actual_tabs" | while IFS= read -r t; do
      [[ "${t,,}" == "${tab_lower} "* ]] && printf '%s' "$t" && break
    done)
    if [ -n "$sw" ]; then
      sw_count=$(( sw_count + 1 ))
      sw_match="$sw"
    fi
  done < "$_CONF"

  if [ "$exact_count" -eq 1 ]; then
    TAB_NAME="$exact_match"
  elif [ "$exact_count" -eq 0 ] && [ "$sw_count" -eq 1 ]; then
    TAB_NAME="$sw_match"
  else
    echo "agent-hook: could not resolve tab for cwd=$1 (exact=$exact_count sw=$sw_count) — skipping state write" >&2
  fi
}

get_prompt() {
  [ ! -f "$_PROMPTS" ] && _PROMPTS="$HOME/.config/claude-prompts.json"
  jq -r --arg k "$1" '.[] | select(.key == $k) | .prompt' "$_PROMPTS" 2>/dev/null
}

# Find the zellij session that has a tab with the given name.
# Uses ZELLIJ_SESSION_NAME env var (required for zellij action outside a pane).
_find_session_for_tab() {
  local tab="$1"
  zellij list-sessions -n 2>/dev/null | awk '{print $1}' | while read -r s; do
    if ZELLIJ_SESSION_NAME="$s" zellij action query-tab-names 2>/dev/null \
        | grep -qF "$tab"; then
      echo "$s"
      return 0
    fi
  done
}

inject_prompt() {
  local tab="$1"
  local prompt="$2"
  [ -z "$tab" ] && return 1

  # When called from outside a zellij session (e.g. systemd daemon), find which
  # session contains this tab — zellij action without ZELLIJ_SESSION_NAME set
  # lists sessions instead of acting, so write-chars goes nowhere.
  local zellij_session="${ZELLIJ_SESSION_NAME:-}"
  if [ -z "$zellij_session" ]; then
    zellij_session=$(_find_session_for_tab "$tab")
    [ -z "$zellij_session" ] && return 1
  fi

  # go-to-tab-name is fire-and-forget — the switch completes asynchronously.
  # Poll dump-layout until the focused tab matches before sending characters,
  # so write-chars never lands in the previously focused pane.
  ZELLIJ_SESSION_NAME="$zellij_session" zellij action go-to-tab-name "$tab" 2>/dev/null
  local i active
  for i in $(seq 1 20); do
    active=$(ZELLIJ_SESSION_NAME="$zellij_session" zellij action dump-layout 2>/dev/null \
      | grep 'focus=true' | grep 'tab name=' \
      | sed 's/.*tab name="\([^"]*\)".*/\1/' | head -1)
    [ "$active" = "$tab" ] && break
    sleep 0.05
  done

  ZELLIJ_SESSION_NAME="$zellij_session" zellij action write-chars -- "$prompt" 2>/dev/null || true
  sleep 0.2
  ZELLIJ_SESSION_NAME="$zellij_session" zellij action write 13 2>/dev/null || true
}

# Call after every injection to keep the Control panel and web beacon in sync.
# Writes agent-current-prompt-<tab> so the UI shows which task is running,
# and clears agent-ready-<tab> so the UI stops showing "waiting for input".
write_inject_state() {
  local tab="$1" key="$2" label="$3"
  local now
  now=$(date +%s)
  # Current-prompt sentinel — TypeScript reads this to show the running task
  printf '{"key":"%s","label":"%s","startedAt":%s}\n' "$key" "$label" "$now" \
    > "/tmp/agent-current-prompt-${tab}"
  # Clear ready/closed state so the UI transitions to "running"
  rm -f "/tmp/agent-ready-${tab}"      "/tmp/claude-ready-${tab}"
  rm -f "/tmp/agent-closed-${tab}"     "/tmp/claude-closed-${tab}"
  rm -f "/tmp/agent-stop-active-${tab}" "/tmp/claude-stop-active-${tab}"
}

play_sound() {
  DISPLAY="${DISPLAY:-:1}" DBUS_SESSION_BUS_ADDRESS="$_DBUS" \
    paplay "/usr/share/sounds/freedesktop/stereo/$1.oga" 2>/dev/null &
}
