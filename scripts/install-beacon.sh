#!/usr/bin/env bash
# install-beacon.sh — Install Cockpit Beacon on this machine
#
# Cockpit Beacon is the desktop popup that appears when Claude Code (or any AI
# agent) finishes a session. It lets you queue prompts, pick what to run next,
# and injects your choice directly into the terminal tab — no browser needed.
#
# Requirements: Python 3.11+, PyQt6, Zellij, jq
# Optional:     xrandr (multi-monitor positioning), paplay (sounds)
#
# Usage:
#   bash scripts/install-beacon.sh
#
# To uninstall:
#   rm -rf ~/.local/share/cockpit-beacon
#   # then restore ~/.claude/hooks/stop.sh from the .bak if it existed
set -euo pipefail

BEACON_HOME="${BEACON_HOME:-$HOME/.local/share/cockpit-beacon}"
HOOKS_DIR="$HOME/.claude/hooks"
CONFIG_DIR="$HOME/.config"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Terminal colours ─────────────────────────────────────────────────────────
if [ -t 1 ]; then
  bold=$'\033[1m' reset=$'\033[0m' green=$'\033[32m' yellow=$'\033[33m'
else
  bold="" reset="" green="" yellow=""
fi
ok()   { printf '%s✓%s %s\n' "$green" "$reset" "$*"; }
warn() { printf '%s⚠%s  %s\n' "$yellow" "$reset" "$*"; }
info() { printf '   %s\n' "$*"; }

echo "${bold}Cockpit Beacon installer${reset}"
echo ""

# ── 1. Copy beacon scripts ───────────────────────────────────────────────────
mkdir -p "$BEACON_HOME"
cp "$SCRIPT_DIR/beacon.py"              "$BEACON_HOME/"
cp "$SCRIPT_DIR/_beacon_audio.py"       "$BEACON_HOME/"
cp "$SCRIPT_DIR/_beacon_config.py"      "$BEACON_HOME/"
cp "$SCRIPT_DIR/_beacon_popups.py"      "$BEACON_HOME/"
cp "$SCRIPT_DIR/_beacon_theme.py"       "$BEACON_HOME/"
cp "$SCRIPT_DIR/agent-hook-bridge.sh"   "$BEACON_HOME/"
cp "$SCRIPT_DIR/agent-hook-lib.sh"      "$BEACON_HOME/"
chmod +x "$BEACON_HOME/agent-hook-bridge.sh" "$BEACON_HOME/agent-hook-lib.sh"
ok "Scripts installed to $BEACON_HOME"

# ── 2. Wire Claude Code Stop hook ───────────────────────────────────────────
mkdir -p "$HOOKS_DIR"

_install_hook() {
  local name="$1" mode="$2"
  local dest="$HOOKS_DIR/${name}.sh"
  if [ -f "$dest" ]; then
    cp "$dest" "${dest}.bak"
    info "Backed up existing ${name}.sh → ${name}.sh.bak"
  fi
  printf '#!/usr/bin/env bash\nexec "%s/agent-hook-bridge.sh" %s\n' \
    "$BEACON_HOME" "$mode" > "$dest"
  chmod +x "$dest"
  ok "${name}.sh → $BEACON_HOME/agent-hook-bridge.sh $mode"
}

_install_hook "stop" "stop"
_install_hook "notification" "notification"

# ── 3. Default prompt library ────────────────────────────────────────────────
PROMPTS_FILE="$CONFIG_DIR/agent-prompts.json"
if [ ! -f "$PROMPTS_FILE" ]; then
  cat > "$PROMPTS_FILE" << 'PROMPTS'
[
  {
    "key": "next_best",
    "slot": 1,
    "icon": "⚡",
    "label": "Next best task",
    "style": "primary",
    "category": "dev",
    "prompt": "Run `git status && git log --oneline -5`. If there's interrupted work, resume it. Otherwise find and close the highest-impact gap (quality, UX, or product). One thing, completely.\n\nWhen done, update the session file with:\ndone: <what you completed>\nnext: <what remains>\ntests: <N pass · N fail, or 'no suite'>\ntodos: <count> TODOs\nhealth: <good | needs attention | critical>"
  },
  {
    "key": "test_and_fix",
    "slot": 2,
    "icon": "🧪",
    "label": "Test & fix",
    "style": "action",
    "category": "dev",
    "prompt": "Run the full test suite. Fix every failure — trace each error to root cause. Then verify the primary user flows work end-to-end."
  },
  {
    "key": "commit_push",
    "slot": 3,
    "icon": "📦",
    "label": "Commit & push",
    "style": "action",
    "category": "ship",
    "prompt": "Verify type check and tests pass. Review git diff. Write a conventional commit message (<type>(<scope>): <description>) explaining why. Commit and push to origin."
  },
  {
    "key": "review",
    "slot": 4,
    "icon": "🔍",
    "label": "Review & clean",
    "style": "action",
    "category": "quality",
    "prompt": "Review the last 5 commits for quality issues: DRY violations, SSOT breaks, type safety gaps, poor error handling. Fix the top 3 most impactful issues."
  },
  {
    "key": "continue",
    "slot": 9,
    "icon": "▶",
    "label": "Continue",
    "style": "action",
    "category": "control",
    "prompt": "Continue with the current task. Pick up exactly where you left off."
  },
  {
    "key": "close_session",
    "slot": 0,
    "icon": "✓",
    "label": "Close session",
    "style": "action",
    "category": "control",
    "prompt": "The session is complete. Update the session file with final status and stop."
  }
]
PROMPTS
  ok "Prompt library created at $PROMPTS_FILE"
else
  info "Keeping existing $PROMPTS_FILE"
fi

# ── 4. Default project registry ──────────────────────────────────────────────
PROJECTS_FILE="$CONFIG_DIR/agent-projects.conf"
if [ ! -f "$PROJECTS_FILE" ]; then
  cat > "$PROJECTS_FILE" << 'PROJECTS'
# Cockpit Beacon — project registry
# Maps Zellij tab names to project directories.
# Format (one per line):  tab_name|/absolute/path/to/project
# Tab name is case-insensitive and matched against Zellij's tab list.
#
# Example:
#   MyApp|/home/user/dev/myapp
#   API|/home/user/dev/api-server
PROJECTS
  ok "Project registry created at $PROJECTS_FILE"
  warn "Add your projects:"
  info "Edit $PROJECTS_FILE"
  info "Format: tab_name|/path/to/project"
else
  info "Keeping existing $PROJECTS_FILE"
fi

# ── 5. Verify dependencies ───────────────────────────────────────────────────
echo ""
echo "${bold}Dependency check${reset}"

_check_cmd() {
  local cmd="$1" hint="$2"
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd"
  else
    warn "$cmd not found — $hint"
  fi
}

if python3 -c "import PyQt6" 2>/dev/null; then
  ok "PyQt6"
else
  warn "PyQt6 not found"
  info "Install:  pip install PyQt6"
  info "      or: apt install python3-pyqt6"
fi

_check_cmd "jq"      "install: apt install jq  OR  brew install jq"
_check_cmd "zellij"  "required for tab detection — https://zellij.dev"
_check_cmd "xrandr"  "optional, used for multi-monitor positioning — apt install x11-xserver-utils"

# ── 6. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "${bold}Installation complete.${reset}"
echo ""
echo "Beacon activates automatically when Claude Code stops."
echo "Test it:"
echo "  printf '{\"cwd\":\"%s\"}' \"\$PWD\" | bash $BEACON_HOME/agent-hook-bridge.sh stop"
