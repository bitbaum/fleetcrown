#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
TARGET_DIR="${1:-$PWD}"
TAB_NAME="${2:-}"
PROJECTS_CONF="${AGENT_PROJECTS_CONF:-$HOME/.config/agent-projects.conf}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

python3 "$ROOT/scripts/sync-agent-runtime-config.py" >/dev/null 2>&1 || true

[ -x "$ROOT/scripts/agent-hook-bridge.sh" ] || fail "missing agent-hook-bridge.sh"
[ -d "$ROOT/.python-vendor/site-packages/PyQt6" ] || fail "missing vendored PyQt6 runtime"

if ! zellij action query-tab-names >/dev/null 2>&1; then
  fail "not connected to a live Zellij session"
fi

if [ ! -d "$TARGET_DIR" ]; then
  fail "directory does not exist: $TARGET_DIR"
fi

TARGET_DIR="$(realpath "$TARGET_DIR")"

if [ ! -f "$PROJECTS_CONF" ]; then
  PROJECTS_CONF="$HOME/.config/claude-projects.conf"
fi

if [ -z "$TAB_NAME" ]; then
  TAB_NAME=$(
    zellij action dump-layout 2>/dev/null \
      | grep 'focus=true' \
      | grep 'tab name=' \
      | sed 's/.*tab name="\([^"]*\)".*/\1/' \
      | head -1
  )
fi

[ -n "$TAB_NAME" ] || fail "could not determine the active Zellij tab name"

if ! awk -F'|' -v dir="$TARGET_DIR" '
  $0 !~ /^#/ && NF >= 2 && $2 == dir { found=1 }
  END { exit(found ? 0 : 1) }
' "$PROJECTS_CONF" 2>/dev/null; then
  fail "directory is not registered in $(basename "$PROJECTS_CONF"): $TARGET_DIR"
fi

printf 'Triggering Beacon stop smoke test for %s in tab %s\n' "$TARGET_DIR" "$TAB_NAME" >&2
RESULT=$(
  jq -nc --arg cwd "$TARGET_DIR" '{cwd:$cwd}' \
    | AGENT_TAB_NAME="$TAB_NAME" AGENT_BRIDGE_EMIT_PROMPT=1 AGENT_BRIDGE_FORCE_NATIVE_POPUP=1 \
      "$ROOT/scripts/agent-hook-bridge.sh" stop
) || RESULT=""

if [ -z "$RESULT" ]; then
  echo "No prompt returned. Either the popup was dismissed or tab resolution failed." >&2
  exit 1
fi

printf 'Beacon returned a prompt payload (%s chars).\n' "${#RESULT}" >&2
