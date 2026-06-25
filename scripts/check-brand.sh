#!/usr/bin/env bash
# Brand SSOT guard — finds DISPLAY-name strings that bypass APP_NAME.
#
# The display brand name lives in ONE place: src/config/brand.ts (APP_NAME),
# mirrored for shell in scripts/_brand.sh. A rename should be those edits only.
# This script lists any hardcoded "FleetCrown" in rendered code so a rename is
# one-place-verifiable and new hardcodes get caught.
#
# Scope: src/ TS/TSX, excluding the SSOT itself and comment lines. It deliberately
# does NOT flag:
#   - the lowercase `fleetcrown` SLUG (DB / systemd unit / repo / domain) — that's
#     infra identity that intentionally survives a display rebrand (see _brand.sh).
#   - editorial prose in content/ (dated Thoughts essays, docs) — not auto-renamed.
#
# Usage:  bash scripts/check-brand.sh        # list escapes (exit 0, informational)
#         bash scripts/check-brand.sh --strict # exit 1 if any escape exists (CI gate)
set -u
cd "$(dirname "$0")/.." || exit 2

# Rendered "FleetCrown": in JSX text or string/template literals, NOT in comments.
hits=$(grep -rnE "FleetCrown" src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "src/config/brand.ts" \
  | grep -vE ":[[:space:]]*(//|\*|/\*)" \
  | grep -E ">[^<]*FleetCrown|\"[^\"]*FleetCrown|\`[^\`]*FleetCrown|'[^']*FleetCrown")

count=$(printf "%s" "$hits" | grep -c . )
if [ "$count" -eq 0 ]; then
  echo "✓ brand SSOT clean — no display-name strings bypass APP_NAME"
  exit 0
fi

echo "⚠ $count display-name string(s) bypass APP_NAME (should use {APP_NAME} / \${APP_NAME}):"
echo "$hits"
echo
echo "Fix: import { APP_NAME } from \"@/config/brand\" and interpolate. Comments + the"
echo "lowercase 'fleetcrown' slug (DB/unit/repo/domain) are intentionally exempt."
[ "${1:-}" = "--strict" ] && exit 1 || exit 0
