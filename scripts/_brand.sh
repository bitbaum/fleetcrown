#!/bin/bash
# Single source of truth for the product brand on the shell side.
# Mirrors src/config/brand.ts on the TypeScript side. To rebrand the entire
# product, edit this file + src/config/brand.ts + the vercel.json alias +
# DNS at the registrar — that's it.
#
# Sourced by: fleetcrown-daemon.sh, agent-hook-bridge.sh, fleetcrown-beacon-window.sh,
#             install-*.sh, beacon.py (via _beacon_config.py).

# Display name. Appears in log lines, install prompts.
APP_NAME="FleetCrown"

# Lowercase kebab-case identifier. Used in /tmp/<slug>-* paths, env var
# prefixes, package names. Changing this requires migrating any on-disk
# state (running daemons should be restarted).
APP_SLUG="fleetcrown"

# Canonical hostname for the remote deployment. Used by the daemon when no
# local server is reachable. Override via COCKPIT_BASE_URL / APP_BASE_URL.
APP_DOMAIN="fleetcrown.vercel.app"

# Resolve an env var by name preferring APP_*, then FLEETCROWN_* (current slug),
# then COCKPIT_* (legacy) for transition. Used to migrate env-var names
# gradually without breaking machines that already export old prefixes.
#   _brand_env DAEMON_TOKEN ""   →  $APP_DAEMON_TOKEN || $FLEETCROWN_DAEMON_TOKEN || $COCKPIT_DAEMON_TOKEN || ""
_brand_env() {
  local suffix="$1" default="${2:-}"
  local app_var="APP_${suffix}"
  local slug_var="FLEETCROWN_${suffix}"
  local legacy_var="COCKPIT_${suffix}"
  echo "${!app_var:-${!slug_var:-${!legacy_var:-$default}}}"
}

# Convenience: build /tmp paths through APP_SLUG so a rename moves them
# automatically.  Usage: _brand_tmp "run-${tab}"   →   /tmp/fleetcrown-run-<tab>
_brand_tmp() {
  echo "/tmp/${APP_SLUG}-${1}"
}
