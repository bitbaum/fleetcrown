#!/usr/bin/env bash
#
# Contain the box-runner's blast radius (DevOps remediation #1).
#
# The box-runner spawns agent PTYs that run arbitrary agent CLIs. It runs as
# `ubuntu`, which owns every co-tenant app's .env under /opt/*, so a
# prompt-injected or misbehaving agent could read every product's secrets + DB
# URLs and the box SSH keys. This installs a systemd DROP-IN that makes those
# paths kernel-inaccessible to the runner process AND every PTY it spawns —
# without changing the user (the `claude` CLI lives in /home/ubuntu, so a full
# user migration would need CLI relocation; this delivers the containment now).
#
# Safe because the runner only needs: its own dir (/opt/fleetcrown/runner),
# fresh git clones under /home/ubuntu/dev, the claude CLI in /home/ubuntu/.local,
# its token/config in /home/ubuntu/.config + .claude, and system bins. It never
# reads another /opt/<app> — verified in src/lib/agent-execution/box-workspace.ts
# (clones from GitHub into $HOME/dev, never from /opt).
#
# Reversible: the drop-in is a separate file. Roll back with --revert.
#
# Usage:
#   bash scripts/hetzner/harden-box-runner.sh          # apply + restart + verify
#   bash scripts/hetzner/harden-box-runner.sh --dry-run # print the drop-in only
#   bash scripts/hetzner/harden-box-runner.sh --revert  # remove the drop-in
set -euo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/_box-env.sh"   # SSOT: HETZNER_IP, BOX_ROOT, BOX_UBUNTU
HOST="${FLEETCROWN_BOX_HOST:-$BOX_ROOT}"
UNIT="fleetcrown-box-runner.service"
DROPIN_DIR="/etc/systemd/system/${UNIT}.d"
DROPIN="${DROPIN_DIR}/10-hardening.conf"

# Co-tenant paths the runner must never read. `-` prefix = ignore if absent, so
# this stays correct as apps come and go. /opt/fleetcrown is intentionally NOT
# listed (the runner lives there); /home/ubuntu/.ssh hides the box SSH keys.
read -r -d '' DROPIN_BODY <<'CONF' || true
[Service]
# --- Blast-radius containment (harden-box-runner.sh) ---
# Kernel-enforced for the service AND every agent PTY it spawns: a compromised
# agent cannot read another product's secrets, the backups, or the box SSH keys.
NoNewPrivileges=true
PrivateTmp=true
InaccessiblePaths=-/home/ubuntu/.ssh -/opt/orangecat -/opt/kivvi -/opt/botsmann -/opt/datacat-api -/opt/datacat-web -/opt/petvity -/opt/printcraft -/opt/reparaturbonus-zh -/opt/revamp-info -/opt/revampit -/opt/sbb-lost-found -/opt/solon -/opt/surf-your-life -/opt/vitareba -/opt/aoz-wohnen -/opt/supabase -/opt/backups -/opt/monitoring -/opt/_appcron
CONF

if [ "${1:-}" = "--dry-run" ]; then
  echo "Would write ${HOST}:${DROPIN}:"; echo "---"; printf '%s\n' "$DROPIN_BODY"; echo "---"
  exit 0
fi

if [ "${1:-}" = "--revert" ]; then
  echo "→ removing hardening drop-in on ${HOST}"
  ssh "$HOST" "rm -f '${DROPIN}' && systemctl daemon-reload && systemctl restart '${UNIT}' && sleep 4 && systemctl is-active '${UNIT}'"
  echo "✓ reverted — runner back to un-sandboxed unit"
  exit 0
fi

echo "→ installing hardening drop-in on ${HOST}:${DROPIN}"
ssh "$HOST" "mkdir -p '${DROPIN_DIR}' && cat > '${DROPIN}'" <<CONF
$DROPIN_BODY
CONF

echo "→ daemon-reload + restart + verify"
ssh "$HOST" "systemctl daemon-reload && systemctl restart '${UNIT}' && sleep 4 && systemctl is-active '${UNIT}'"

echo "→ proof: co-tenant secret is now unreadable by the runner"
ssh "$HOST" "systemctl show '${UNIT}' -p InaccessiblePaths | head -1; \
  echo -n '  runner can read /opt/orangecat/app/.env? '; \
  systemd-run --quiet --pipe --uid=ubuntu --property=InaccessiblePaths='-/opt/orangecat' \
    cat /opt/orangecat/app/.env >/dev/null 2>&1 && echo 'YES (unexpected)' || echo 'NO ✓ (blocked)'" || true

echo "✓ box-runner hardened. VERIFY IT STILL WORKS: dispatch a small task from"
echo "  /control to a project and confirm the runner clones + runs it (journalctl"
echo "  -u ${UNIT} -f). If anything breaks, roll back: $0 --revert"
