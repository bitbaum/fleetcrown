#!/usr/bin/env bash
# Box-side: wait for in-flight agents to finish, THEN restart the box-runner.
#
# Runs ON the box as a detached transient systemd unit, not inside the deploy.
# The deploy used to do this waiting itself, in the CI job, and it was the
# single most expensive thing in the pipeline: 480 of the ship step's 570
# seconds were this loop, which then timed out and restarted anyway. That is
# the worst of both worlds — the cost of patience with the semantics of
# impatience, paid in CI wall-clock on every runner-code change.
#
# Waiting is free HERE and expensive THERE. Moving the wait to the box lets it
# be both longer (agents genuinely finish instead of being killed at 8 minutes)
# and free (the deploy returns as soon as the app is verified live).
#
# Deliberately NOT in the runner's own cgroup: systemd-run gives this its own
# unit, so restarting fleetcrown-box-runner cannot kill the thing doing the
# restarting.

set -uo pipefail

UNIT="fleetcrown-box-runner"
CGROUP="/sys/fs/cgroup/system.slice/${UNIT}.service/cgroup.procs"
# Generous because it costs nothing now. Still bounded: a runner-code fix must
# eventually land even if some agent never exits.
MAX="${FLEETCROWN_RUNNER_DRAIN_SECS:-1800}"
INTERVAL=20

log() { logger -t fleetcrown-drain "$*" 2>/dev/null || true; echo "[drain] $*"; }

count_agents() {
  [ -r "$CGROUP" ] || { echo 0; return 0; }
  local c=0 p comm
  for p in $(cat "$CGROUP" 2>/dev/null); do
    comm="$(cat "/proc/$p/comm" 2>/dev/null || true)"
    case "$comm" in
      claude|hermes|codex|cursor-agent|grok) c=$((c + 1)) ;;
    esac
  done
  echo "$c"
}

waited=0
while [ "$waited" -lt "$MAX" ]; do
  n="$(count_agents)"
  if [ "${n:-0}" -eq 0 ] 2>/dev/null; then
    log "runner idle after ${waited}s — restarting to pick up new code"
    systemctl restart "$UNIT" && sleep 4
    if systemctl is-active "$UNIT" >/dev/null 2>&1; then
      log "✓ ${UNIT} restarted (drained cleanly, no agent killed)"
      exit 0
    fi
    log "✗ ${UNIT} did not come back after restart"
    exit 1
  fi
  log "${n} agent(s) in-flight — deferring restart (${waited}s/${MAX}s)"
  sleep "$INTERVAL"
  waited=$((waited + INTERVAL))
done

# Cap reached. Restart anyway: stale runner code is its own outage, and at 30
# minutes an "in-flight" agent is more likely wedged than working.
log "⚠ drain cap ${MAX}s reached — restarting anyway so the runner code lands"
systemctl restart "$UNIT" && sleep 4
systemctl is-active "$UNIT" >/dev/null 2>&1 \
  && { log "✓ ${UNIT} restarted (forced after cap)"; exit 0; }
log "✗ ${UNIT} did not come back after forced restart"
exit 1
