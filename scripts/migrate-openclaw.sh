#!/usr/bin/env bash
# migrate-openclaw.sh — move the OpenClaw/Ivy assistant from the laptop to the
# always-on Hetzner box (co-located with FleetCrown). OpenClaw is a SEPARATE
# system from FleetCrown; this lives here for discoverability next to
# docs/development/box-rescale-ivy-migration-runbook.md.
#
# Two phases:
#   package   run on the LAPTOP — stop the gateway, archive ~/.openclaw, ship to box
#   restore   run on the BOX as the run user — extract, fix perms, print the
#             gated next-steps (install, venv rebuild, gateway install, WhatsApp)
#
# Mechanical/safe steps are automated. Judgment gates (gateway install, venv
# rebuild, pg_hba, WhatsApp re-pair) STOP and are printed for you to run — this
# is a one-shot migration of a credentialed agent, not something to auto-run blind.
#
# Usage:
#   bash scripts/migrate-openclaw.sh package    # on the laptop
#   ssh <box>; sudo -iu openclaw bash /tmp/migrate-openclaw.sh restore
set -euo pipefail

# Box-address SSOT. Sourced conditionally: the `restore` phase runs this script
# FROM the box out of /tmp (no repo there); HOST is only used by `package`.
BOX_ENV="$(dirname "${BASH_SOURCE[0]}")/hetzner/_box-env.sh"
if [ -f "$BOX_ENV" ]; then . "$BOX_ENV"; fi
HOST="${OPENCLAW_BOX:-${BOX_ROOT:-}}"
STATE="$HOME/.openclaw"
PKG="/tmp/openclaw-migrate.tgz"
EXCLUDES=(
  --exclude='.openclaw/.venv-stt'
  --exclude='.openclaw/.venvs'
  --exclude='.openclaw/browser'
  --exclude='.openclaw/cache'
  --exclude='*/node_modules'
  --exclude='*/__pycache__'
  --exclude='*.pyc'
)

cmd_package() {
  command -v openclaw >/dev/null || { echo "✗ openclaw CLI not on PATH — run this on the laptop that hosts Ivy"; exit 1; }
  [ -d "$STATE" ] || { echo "✗ $STATE not found"; exit 1; }

  echo "⚠️  This STOPS the live Ivy gateway — she goes offline until restored on the box."
  read -rp "Proceed? [y/N] " a; [ "${a:-}" = "y" ] || { echo "aborted"; exit 1; }

  echo "→ stopping laptop gateway"
  openclaw gateway stop || true
  sleep 2
  if pgrep -f "openclaw-gateway" >/dev/null 2>&1; then
    echo "⚠️  a gateway process is still running after 'gateway stop'."
    read -rp "   Continue packaging anyway (risk: dual gateway → session ban)? [y/N] " b
    [ "${b:-}" = "y" ] || { echo "aborted — stop the gateway and retry"; exit 1; }
  fi

  echo "→ archiving $STATE (excluding venvs / browser / cache / node_modules)"
  tar czf "$PKG" -C "$HOME" "${EXCLUDES[@]}" .openclaw
  echo "  package size: $(du -h "$PKG" | cut -f1)"

  echo "→ shipping package + this script to ${HOST}:/tmp/"
  rsync -az "$PKG" "${HOST}:/tmp/"
  rsync -az "$0" "${HOST}:/tmp/migrate-openclaw.sh"

  cat <<EOF

✓ packaged + transferred. NEXT — on the box, as the run user (e.g. 'openclaw'):
    ssh ${HOST}
    sudo -iu openclaw bash /tmp/migrate-openclaw.sh restore

  Keep the laptop gateway STOPPED until cutover is confirmed (no dual gateway).
EOF
}

cmd_restore() {
  [ -f "$PKG" ] || { echo "✗ $PKG not found — run '$0 package' on the laptop first"; exit 1; }

  echo "→ extracting into $HOME/.openclaw"
  tar xzf "$PKG" -C "$HOME"
  chmod 600 "$HOME/.openclaw/.env" 2>/dev/null || true
  chmod 700 "$HOME/.openclaw/credentials" 2>/dev/null || true
  echo "✓ state restored + perms tightened (.env 600, credentials/ 700)"

  cat <<'EOF'

── GATED steps (run in order, verify each — see the runbook for detail) ────────
 1. Install OpenClaw (match the laptop version):
      npm i -g openclaw@2026.4.23
 2. Rebuild python venvs per OpenClaw setup. Confirm STT routes to an API
    (local STT is the heavy path you do NOT want on the shared box).
 3. SECURITY — pg_hba: this run user must NOT reach the client DBs. Both should
    be DENIED:
      psql -l
      psql kivvi -c '\dt'
    If they aren't denied, fix /etc/postgresql/*/main/pg_hba.conf + reload.
 4. Install + start the gateway, loopback-bound (NOT exposed on the public IP):
      openclaw gateway install --bind loopback
      openclaw gateway start
      openclaw gateway status
 5. WhatsApp: re-pair from the portal (sessions are device-bound). Telegram
    migrates automatically via its token.
 6. Portal stays localhost:18790 — reach it via Tailscale, or:
      ssh -N -L 18790:localhost:18790 <box>
 7. Cutover: message Ivy on Telegram → she answers from the box. Confirm the
    LAPTOP gateway is still stopped (run 'openclaw gateway status' there).
 8. Back up Ivy's brain: add ~/.openclaw/{knowledge,messages}.sqlite +
    credentials/ + .env to the off-box backup (pg-backup covers Postgres only).
 9. Point the watchdog at Ivy: append to /opt/monitoring/targets.conf:
      ivy|http://localhost:18790/<health-path>|200
EOF
}

case "${1:-}" in
  package) cmd_package ;;
  restore) cmd_restore ;;
  *)
    echo "usage: $0 {package|restore}"
    echo "  package  → run on the LAPTOP (stops gateway, ships ~/.openclaw to the box)"
    echo "  restore  → run on the BOX as the run user (extracts + prints gated steps)"
    exit 1
    ;;
esac
