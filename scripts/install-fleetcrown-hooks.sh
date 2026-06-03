#!/usr/bin/env bash
# Install ZSH hooks that let the app detect when you are actively typing at
# the prompt — so auto-inject skips your tab instead of garbling your input.
#
# Usage:  bash scripts/install-fleetcrown-hooks.sh
# Effect: appends a small hook block to ~/.zshrc (idempotent).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_brand.sh
source "$SCRIPT_DIR/_brand.sh"

MARKER="# ${APP_SLUG}-typing-hooks"
ZSHRC="${HOME}/.zshrc"

if grep -qF "$MARKER" "$ZSHRC" 2>/dev/null; then
  echo "Hooks already installed in $ZSHRC — nothing to do."
  exit 0
fi

# Heredoc with substitution enabled (no quotes on EOF) so $APP_SLUG expands
# into the emitted hook block. The inner $-references that must stay literal
# in the user's .zshrc are escaped with \.
cat >> "$ZSHRC" << EOF

# ${APP_SLUG}-typing-hooks
# Writes /tmp/${APP_SLUG}-typing-<PANE_ID> while the user is at the interactive
# prompt so the app's inject API can skip this tab instead of garbling input.
if [[ -n "\${ZELLIJ:-}" && -n "\${ZELLIJ_PANE_ID:-}" ]]; then
  # Capture the tab name once at shell start (this pane must be focused).
  _${APP_SLUG}_tab=\$(zellij action dump-layout 2>/dev/null \\
    | grep 'focus=true' \\
    | grep -o 'tab name="[^"]*"' \\
    | sed 's/tab name="\\(.*\\)"/\\1/' \\
    | head -1)

  function _${APP_SLUG}_zle_line_init() {
    [[ -n "\${_${APP_SLUG}_tab:-}" ]] && \\
      printf '%s\\n%s' "\$_${APP_SLUG}_tab" "\$(date +%s)" \\
        > "/tmp/${APP_SLUG}-typing-\${ZELLIJ_PANE_ID}"
  }
  function _${APP_SLUG}_zle_line_finish() {
    rm -f "/tmp/${APP_SLUG}-typing-\${ZELLIJ_PANE_ID}"
  }
  zle -N zle-line-init _${APP_SLUG}_zle_line_init
  zle -N zle-line-finish _${APP_SLUG}_zle_line_finish
  trap 'rm -f "/tmp/${APP_SLUG}-typing-\${ZELLIJ_PANE_ID}"' EXIT
fi
EOF

echo "Done — hooks appended to $ZSHRC."
echo "Reload with:  source ~/.zshrc"
