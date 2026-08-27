#!/usr/bin/env bash
# Shared helpers for the Hetzner self-host tooling. Source, don't execute.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
BOX="$BOX_UBUNTU"
MANIFEST="$HERE/apps.conf"

# app_lookup <name> — sets NAME PORT DOMAINS REPO APP_DIR DB or exits 1
app_lookup() {
  local line
  line=$(grep -v '^#' "$MANIFEST" | grep "^$1|" || true)
  [ -z "$line" ] && { echo "ERROR: '$1' not in $MANIFEST" >&2; return 1; }
  # Extra fields must be named, or bash's last variable swallows the remainder
  # and DB silently becomes "db|owner|kind|...". Missing trailing fields read as
  # empty, so a 6-field line still parses exactly as before.
  IFS='|' read -r NAME PORT DOMAINS REPO APP_DIR DB OWNER KIND STATUS PLAN PRICE SINCE <<<"$line"
}

app_names() { grep -v '^#' "$MANIFEST" | cut -d'|' -f1; }

# -n: don't consume stdin (box() is used inside while-read loops)
box() { ssh -n -o BatchMode=yes "$BOX" "$@"; }
