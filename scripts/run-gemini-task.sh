#!/bin/bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: run-gemini-task.sh <tab> <project-dir> <prompt-file> [model]" >&2
  exit 2
fi

TAB_NAME="$1"
PROJECT_DIR="$2"
PROMPT_FILE="$3"
MODEL="${4:-auto}"  # must match AGENT_DEFAULT_MODELS.gemini in src/lib/agent-registry.ts

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

source "$HOME/.bashrc" >/dev/null 2>&1 || true

cd "$PROJECT_DIR"

status=0
if [ "$MODEL" = "auto" ]; then
  gemini --prompt "$(cat "$PROMPT_FILE")" --approval-mode yolo || status=$?
else
  gemini --model "$MODEL" --prompt "$(cat "$PROMPT_FILE")" --approval-mode yolo || status=$?
fi

rm -f "$PROMPT_FILE"

printf '%s' "$PROJECT_DIR" \
  | jq -Rs '{cwd:.}' \
  | AGENT_TAB_NAME="$TAB_NAME" AGENT_CURRENT_AGENT="gemini" "$ROOT/scripts/agent-hook-bridge.sh" stop || true

exit "$status"
