#!/usr/bin/env bash
# _agents.sh — Single Source of Truth (bash mirror) for supported CLI agents.
#
# This file is intentionally small and the ONLY place in the bash layer that lists
# agent-specific behavior for runtime (scanning, launch, quit, session dir).
#
# PRIMARY SSOT: src/lib/agent-registry.ts
#   - When adding a new agent, update the TypeScript registry first.
#   - Then add the corresponding entry here (keep the two in sync).
#   - Future improvement: generate this file from the TS registry at daemon tarball build time.
#
# Format: simple associative arrays + helper functions.
# Adding a new agent should only require touching this file + the TS registry.

# Supported agents (keep in sync with AGENT_IDS in src/lib/agent-registry.ts)
AGENTS=(claude grok codex gemini cursor openclaw)

# Process basenames to recognize as this agent (used by _scan_agents)
declare -A AGENT_PROCESS_NAMES=(
  [claude]="claude"
  [grok]="grok"
  [codex]="codex"
  [gemini]="gemini"
  [cursor]="agent"          # special: we do extra path checks in the scanner
  [openclaw]="openclaw"
)

# Graceful quit command to send when switching away from this agent
declare -A AGENT_QUIT_CMD=(
  [claude]="/exit"
  [grok]="/exit"
  [codex]="q"
  [gemini]="q"
  [cursor]=""
  [openclaw]="q"
)

# Official one-liner / command the user should run to install the CLI for the first time.
# These are shown in the web UI and injected by the "Install" flow.
declare -A AGENT_INSTALL_CMD=(
  [claude]="curl -fsSL https://claude.ai/install.sh | bash || echo 'Visit https://claude.ai for manual instructions'"
  [grok]="curl -fsSL https://x.ai/cli/install.sh | bash"
  [codex]="echo 'Codex install instructions at https://platform.openai.com/docs/guides/code' ; echo 'Typically: pip install openai or use the official binary'"
  [gemini]="echo 'Install Google Gemini CLI from https://ai.google.dev/gemini-api/docs/cli'"
  [cursor]="curl https://cursor.com/install -fsS | bash"
  [openclaw]="echo 'OpenClaw: see project docs for installation'"
)

# Command to launch the agent in a given directory.
# Usage: eval "$(_agent_launch_cmd "grok" "/path/to/project" "$model")"
_agent_launch_cmd() {
  local agent="$1" dir="$2" model="${3:-}"
  local esc_dir
  esc_dir=$(printf '%q' "$dir")

  case "$agent" in
    claude)
      echo "source ~/.bashrc >/dev/null 2>&1 || true; cd ${esc_dir} && claude"
      ;;
    grok)
      echo "source ~/.bashrc >/dev/null 2>&1 || true; cd ${esc_dir} && grok"
      ;;
    gemini)
      local mflag=""
      [ -n "$model" ] && mflag=" -m $(printf '%q' "$model")"
      echo "source ~/.bashrc >/dev/null 2>&1 || true; cd ${esc_dir} && gemini${mflag}"
      ;;
    codex)
      local esc_model
      esc_model=$(printf '%q' "${model:-gpt-5.4}")
      echo "source ~/.bashrc >/dev/null 2>&1 || true; cd ${esc_dir} && codex --model ${esc_model} --no-alt-screen"
      ;;
    cursor)
      echo "source ~/.bashrc >/dev/null 2>&1 || true; cd ${esc_dir} && agent"
      ;;
    openclaw)
      echo "source ~/.bashrc >/dev/null 2>&1 || true; cd ${esc_dir} && openclaw tui"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Session directory for FleetCrown handoff files (done:/next:/status: etc.).
# Only agents with strong native session stores get a special dir.
# Everyone else uses the standard FleetCrown convention (currently ~/.claude/sessions for compatibility).
_agent_session_dir() {
  local agent="${1:-claude}"
  case "$agent" in
    grok) echo "$HOME/.grok/sessions" ;;
    claude) echo "$HOME/.claude/sessions" ;;
    *) echo "$HOME/.claude/sessions" ;;   # safe default for codex/gemini/cursor/openclaw handoff
  esac
}

# Emit "<mtime>|<label>" for a fresh, project-scoped native activity signal,
# when an adapter provides one. Hooks and /proc remain the universal baseline;
# this optional capability covers prompts typed directly inside a supported TUI.
_agent_direct_activity() {
  local agent="$1" dir="$2" file="" encoded_dir
  case "$agent" in
    grok)
      encoded_dir=$(printf '%s' "$dir" | sed 's#/#%2F#g')
      file=$(find "$HOME/.grok/sessions/$encoded_dir" -name updates.jsonl -printf '%T@ %p\n' 2>/dev/null \
        | sort -nr | head -1 | cut -d' ' -f2-)
      [ -n "$file" ] && printf '%s|Direct terminal activity\n' "$(stat -c '%Y' "$file" 2>/dev/null)"
      ;;
    claude)
      # Claude Code stores per-project transcripts at
      # ~/.claude/projects/<dashed-cwd>/<session_uuid>.jsonl; the dir name is the
      # absolute path with every "/" replaced by "-". mtime updates on every
      # appended event, so a fresh mtime is reliable evidence the agent is
      # actively processing — including prompts the user typed directly into
      # the TUI (no FleetCrown dispatch sentinel exists for those).
      encoded_dir=$(printf '%s' "$dir" | tr '/' '-')
      file=$(find "$HOME/.claude/projects/$encoded_dir" -maxdepth 1 -name '*.jsonl' -printf '%T@ %p\n' 2>/dev/null \
        | sort -nr | head -1 | cut -d' ' -f2-)
      [ -n "$file" ] && printf '%s|Direct terminal activity\n' "$(stat -c '%Y' "$file" 2>/dev/null)"
      ;;
    cursor)
      # Cursor Agent CLI writes agent transcripts under
      # ~/.cursor/projects/<cwd-without-leading-slash-dashes>/agent-transcripts/.
      encoded_dir=$(printf '%s' "${dir#/}" | tr '/' '-')
      file=$(find "$HOME/.cursor/projects/$encoded_dir/agent-transcripts" -name '*.jsonl' -printf '%T@ %p\n' 2>/dev/null \
        | sort -nr | head -1 | cut -d' ' -f2-)
      [ -n "$file" ] && printf '%s|Direct terminal activity\n' "$(stat -c '%Y' "$file" 2>/dev/null)"
      ;;
    # Add adapters here only when they expose a stable, project-scoped log.
    # Process detection, handoffs, and web-dispatched prompts work without it.
  esac
}

# Returns 0 if the given basename+full argv looks like the Cursor agent (not a random "agent" binary).
_is_cursor_agent() {
  local basename="$1" argv0="$2"
  if [[ "$basename" == "cursor-agent" ]]; then
    [[ "$argv0" == *"cursor-agent"* ]] || [[ "$argv0" == *"/.cursor/"* ]]
    return $?
  fi
  [[ "$basename" == "agent" ]] && { [[ "$argv0" == *".local/bin/agent"* ]] || [[ "$argv0" == *"/.cursor/"* ]]; }
}

# Convenience: list of process names we care about (for scanners)
_agent_all_process_names() {
  printf '%s\n' "${AGENT_PROCESS_NAMES[@]}"
}

# Scan /proc once; output lines of "<cwd> <agent_id>" for all running agents.
# Shared by the daemon runtime push and live-adapter resolution in hooks.
_scan_agents() {
  for pd in /proc/[0-9]*/; do
    pd="${pd%/}"
    [ -f "$pd/cmdline" ] || continue
    local argv0 basename agent_id=""
    argv0=$(tr '\0' '\n' < "$pd/cmdline" 2>/dev/null | head -1) || continue
    basename="${argv0##*/}"

    for a in "${AGENTS[@]}"; do
      if [ "$a" = "cursor" ]; then
        _is_cursor_agent "$basename" "$argv0" || continue
        agent_id="$a"
        break
      fi
      local expected="${AGENT_PROCESS_NAMES[$a]}"
      if [ "$basename" = "$expected" ]; then
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

# Infer adapter from Zellij tab suffix: "FleetCrown Cursor" → cursor.
_infer_adapter_from_tab_name() {
  local tab="$1"
  local lower="${tab,,}"
  local suffix
  for suffix in grok claude codex gemini cursor openclaw; do
    if [ "$lower" = "$suffix" ] || [[ "$lower" == *" ${suffix}" ]] || [[ "$lower" == *"-${suffix}" ]]; then
      echo "$suffix"
      return 0
    fi
  done
}
