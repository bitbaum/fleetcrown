#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

check_file() {
  local path="$1"
  [ -e "$path" ] || fail "missing $path"
}

check_exec() {
  local path="$1"
  [ -x "$path" ] || fail "not executable: $path"
}

check_file "$ROOT/scripts/beacon.py"
check_exec "$ROOT/scripts/agent-hook-bridge.sh"
check_exec "$ROOT/scripts/agent-hook-lib.sh"
check_exec "$ROOT/scripts/smoke-beacon-stop.sh"
check_file "$ROOT/.python-vendor/site-packages/PyQt6/__init__.py"
check_file "/home/g/dev/dotfiles/.claude/settings.json"
check_exec "/home/g/dev/dotfiles/.claude/hooks/stop.sh"
check_exec "/home/g/dev/dotfiles/.claude/hooks/notification.sh"
check_exec "/home/g/dev/dotfiles/.claude/hooks/beacon.py"

python3 "$ROOT/scripts/sync-agent-runtime-config.py"

[ -f /home/g/.config/agent-prompts.json ] || [ -f /home/g/.config/claude-prompts.json ] || fail "missing prompt config"
[ -f /home/g/.config/agent-projects.conf ] || [ -f /home/g/.config/claude-projects.conf ] || fail "missing projects config"

python3 - <<'PY'
import json
import os
import pathlib
import sys

root = pathlib.Path("/home/g/dev/cockpit")
sys.path.insert(0, str(root / ".python-vendor" / "site-packages"))

import PyQt6  # noqa: F401

settings = json.load(open("/home/g/dev/dotfiles/.claude/settings.json"))
hooks = settings.get("hooks", {})
for name in ("Stop", "Notification"):
    if not hooks.get(name):
        raise SystemExit(f"missing {name} hook registration")

print("PyQt6 import: ok")
print("Claude hooks: ok")
PY

echo "agent runtime check: ok"
echo "smoke test: $ROOT/scripts/smoke-beacon-stop.sh [project-dir]"
