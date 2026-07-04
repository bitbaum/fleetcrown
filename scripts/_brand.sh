# shellcheck shell=bash
# Shell-side mirror of the product brand. The canonical SSOT is
# src/config/brand.ts — this file exists so shell scripts have the same
# rebrand lever the TypeScript side does. Keep the four values below in sync
# with brand.ts (APP_NAME / APP_SLUG / APP_DOMAIN / BRIDGE_DOMAIN); nothing
# else here may redefine the brand.
#
# Usage:  source "$(dirname "${BASH_SOURCE[0]}")/_brand.sh"   # adjust path
#
# Note on slug vs. display name: APP_SLUG is also the infra identifier baked
# into the `fleetcrown` database, the `fleetcrown-app` systemd unit, and the
# repo path. Those intentionally do NOT change on a display rebrand — only
# APP_NAME (and possibly APP_DOMAIN) do. That is why a rename is "Tier A"
# (display + copy) and leaves the slug-tied infrastructure untouched.

# Guard against double-sourcing.
[ -n "${_FLEETCROWN_BRAND_SOURCED:-}" ] && return 0
_FLEETCROWN_BRAND_SOURCED=1

APP_NAME="FleetCrown"                       # display string
APP_SLUG="fleetcrown"                       # lowercase kebab; URLs, paths, infra ids
APP_DOMAIN="fleetcrown.orangecat.ch"        # canonical hostname (no scheme)
BRIDGE_DOMAIN="bridge.orangecat.ch"         # shared SSE fan-out host

APP_URL="https://${APP_DOMAIN}"
BRIDGE_URL="https://${BRIDGE_DOMAIN}/sse"

export APP_NAME APP_SLUG APP_DOMAIN BRIDGE_DOMAIN APP_URL BRIDGE_URL

# Resolve APP_<SUFFIX> → FLEETCROWN_<SUFFIX> → COCKPIT_<SUFFIX> (legacy).
# Usage: token="$(_brand_env SESSION_TOKEN)"
_brand_env() {
  local suffix="$1"
  local fallback="${2:-}"
  local app="APP_${suffix}"
  local fleet="FLEETCROWN_${suffix}"
  local legacy="COCKPIT_${suffix}"
  printf '%s' "${!app:-${!fleet:-${!legacy:-$fallback}}}"
}
export -f _brand_env
