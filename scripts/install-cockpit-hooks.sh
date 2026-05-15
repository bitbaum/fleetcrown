#!/usr/bin/env bash
# Install ZSH hooks that let Cockpit detect when you are actively typing at
# the prompt — so auto-inject skips your tab instead of garbling your input.
#
# Usage:  bash scripts/install-cockpit-hooks.sh
# Effect: appends a small hook block to ~/.zshrc (idempotent).

set -euo pipefail

MARKER="# cockpit-typing-hooks"
ZSHRC="${HOME}/.zshrc"

if grep -qF "$MARKER" "$ZSHRC" 2>/dev/null; then
  echo "Hooks already installed in $ZSHRC — nothing to do."
  exit 0
fi

cat >> "$ZSHRC" << 'EOF'

# cockpit-typing-hooks
# Writes /tmp/cockpit-typing-<PANE_ID> while the user is at the interactive
# prompt so Cockpit's inject API can skip this tab instead of garbling input.
if [[ -n "${ZELLIJ:-}" && -n "${ZELLIJ_PANE_ID:-}" ]]; then
  # Capture the tab name once at shell start (this pane must be focused).
  _cockpit_tab=$(zellij action dump-layout 2>/dev/null \
    | grep 'focus=true' \
    | grep -o 'tab name="[^"]*"' \
    | sed 's/tab name="\(.*\)"/\1/' \
    | head -1)

  function _cockpit_zle_line_init() {
    [[ -n "${_cockpit_tab:-}" ]] && \
      printf '%s\n%s' "$_cockpit_tab" "$(date +%s)" \
        > "/tmp/cockpit-typing-${ZELLIJ_PANE_ID}"
  }
  function _cockpit_zle_line_finish() {
    rm -f "/tmp/cockpit-typing-${ZELLIJ_PANE_ID}"
  }
  zle -N zle-line-init _cockpit_zle_line_init
  zle -N zle-line-finish _cockpit_zle_line_finish
  trap 'rm -f "/tmp/cockpit-typing-${ZELLIJ_PANE_ID}"' EXIT
fi
EOF

echo "Done — hooks appended to $ZSHRC."
echo "Reload with:  source ~/.zshrc"
