#!/bin/bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: run-codex-task.sh <tab> <project-dir> <prompt-file> [model]" >&2
  exit 2
fi

TAB_NAME="$1"
PROJECT_DIR="$2"
PROMPT_FILE="$3"
MODEL="${4:-gpt-5.4}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
SESSION_DIR="${AGENT_SESSIONS_DIR:-$HOME/.claude/sessions}"

mkdir -p "$SESSION_DIR"

source "$HOME/.bashrc" >/dev/null 2>&1 || true

cd "$PROJECT_DIR"

status=0
codex exec \
  --model "$MODEL" \
  --cd "$PROJECT_DIR" \
  --sandbox workspace-write \
  --ask-for-approval never \
  --add-dir "$SESSION_DIR" \
  - < "$PROMPT_FILE" || status=$?

rm -f "$PROMPT_FILE"

printf '%s' "$PROJECT_DIR" \
  | jq -Rs '{cwd:.}' \
  | AGENT_TAB_NAME="$TAB_NAME" AGENT_CURRENT_AGENT="codex" "$ROOT/scripts/agent-hook-bridge.sh" stop || true

exit "$status"
