#!/usr/bin/env bash
# install-daemon.sh — Install the FleetCrown daemon as a systemd user service.
#
# The daemon polls the FleetCrown control plane for commands (inject prompts,
# switch agents, transcribe audio) and pushes local runtime state (which
# agents are running in which project tabs).
#
# Usage:
#   bash scripts/install-daemon.sh             # full install or re-install
#   bash scripts/install-daemon.sh --restart   # restart to load changed daemon code
#   bash scripts/install-daemon.sh --uninstall
#
# Environment:
#   COCKPIT_DAEMON_TOKEN   bearer token (read from .env.local if not set)
#   COCKPIT_BASE_URL       override the cloud URL (optional)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="cockpit-daemon"
SERVICE_FILE="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
ENV_FILE="${HOME}/.config/cockpit/daemon.env"

# ── Colours ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  bold=$'\033[1m' reset=$'\033[0m'
  green=$'\033[32m' yellow=$'\033[33m' red=$'\033[31m' cyan=$'\033[36m'
else
  bold="" reset="" green="" yellow="" red="" cyan=""
fi
ok()   { printf '%s✓%s %s\n' "$green"  "$reset" "$*"; }
info() { printf '%s→%s %s\n' "$cyan"   "$reset" "$*"; }
warn() { printf '%s!%s %s\n' "$yellow" "$reset" "$*"; }
die()  { printf '%s✗%s %s\n' "$red"    "$reset" "$*" >&2; exit 1; }

# ── --restart: reload daemon code without re-generating service file ─────────
# Use this after pulling changes to cockpit-daemon.sh or agent-hook-lib.sh.
#   bash scripts/install-daemon.sh --restart
if [[ "${1:-}" == "--restart" ]]; then
  if ! systemctl --user is-enabled "$SERVICE_NAME" >/dev/null 2>&1; then
    die "Daemon service is not installed — run without --restart to install first."
  fi
  # Refresh unit file so TimeoutStopSec / Restart=always changes apply.
  info "Refreshing systemd unit…"
  COCKPIT_DAEMON_TOKEN="${COCKPIT_DAEMON_TOKEN:-$(grep -E '^COCKPIT_DAEMON_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" | xargs || true)}"
  COCKPIT_BASE_URL="${COCKPIT_BASE_URL:-$(grep -E '^COCKPIT_BASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" | xargs || echo "https://cockpitapp.vercel.app")}"
  export COCKPIT_DAEMON_TOKEN COCKPIT_BASE_URL
  info "Re-installing service unit and restarting with latest scripts…"
  set --
fi

# ── Uninstall ────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  info "Stopping and disabling ${SERVICE_NAME}…"
  systemctl --user stop    "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SERVICE_FILE"
  systemctl --user daemon-reload
  ok "Daemon service removed."
  info "Env file kept at ${ENV_FILE} — remove manually if desired."
  exit 0
fi

# ── Resolve token ─────────────────────────────────────────────────────────────
TOKEN="${COCKPIT_DAEMON_TOKEN:-}"

# Try .env.local in project root
if [ -z "$TOKEN" ] && [ -f "$PROJECT_DIR/.env.local" ]; then
  TOKEN=$(grep -E '^COCKPIT_DAEMON_TOKEN=' "$PROJECT_DIR/.env.local" \
    | head -1 | cut -d= -f2- | tr -d '"'"'" | xargs 2>/dev/null) || true
fi

if [ -z "$TOKEN" ]; then
  die "COCKPIT_DAEMON_TOKEN is not set. Export it or add it to .env.local."
fi

BASE_URL="${COCKPIT_BASE_URL:-https://cockpitapp.vercel.app}"

# ── Check dependencies ────────────────────────────────────────────────────────
missing=()
for cmd in systemctl curl jq zellij; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done
if [ ${#missing[@]} -gt 0 ]; then
  die "Missing required commands: ${missing[*]}"
fi

# ── Capture PATH from the current login environment ──────────────────────────
# systemd user services start with a minimal PATH that often omits ~/.local/bin,
# nix store paths, and wherever the user installed zellij/jq. We snapshot the
# current shell PATH and bake it into the service file so the daemon finds
# everything it needs without extra configuration.
CURRENT_PATH="${PATH}"

# ── Write env file ────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$ENV_FILE")"
cat > "$ENV_FILE" <<EOF
COCKPIT_DAEMON_TOKEN=${TOKEN}
COCKPIT_BASE_URL=${BASE_URL}
COCKPIT_DAEMON_FORCE_REMOTE=1
EOF
chmod 600 "$ENV_FILE"
ok "Env file written to ${ENV_FILE}"

# ── Write service file ────────────────────────────────────────────────────────
mkdir -p "$(dirname "$SERVICE_FILE")"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=FleetCrown local daemon
Documentation=https://github.com/g-but/cockpit
After=network.target
# If it crashes 5× in 2 min, stop retrying — something is wrong
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${SCRIPT_DIR}/cockpit-daemon.sh
# Restart on crash, hang-kill, and self-heal exit (push-loop failure budget).
Restart=always
RestartSec=3
# Give the daemon time to push one heartbeat before systemd considers it hung.
TimeoutStartSec=30
# Don't hang shutdown forever on a stuck zellij subprocess.
TimeoutStopSec=15
# Cap restart storms — StartLimit* in [Unit] still applies.
KillMode=control-group
KillSignal=SIGTERM

# Preserve the login PATH so zellij, jq, ffmpeg, python3 etc. are reachable
Environment=PATH=${CURRENT_PATH}

# Token and base URL loaded from env file (chmod 600 — not visible to other users)
EnvironmentFile=${ENV_FILE}

# Route stdout/stderr to the journal so logs are accessible via:
#   journalctl --user -u cockpit-daemon -f
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cockpit-daemon

[Install]
WantedBy=default.target
EOF
ok "Service file written to ${SERVICE_FILE}"

# Keep the hosted-install copy aligned with this checkout so repair_helper
# does not downgrade to an older production bundle.
INSTALL_DIR="${HOME}/.local/share/cockpit"
mkdir -p "$INSTALL_DIR"
for runtime_file in cockpit-daemon.sh cockpit agent-hook-lib.sh agent-hook-bridge.sh \
    _agents.sh _brand.sh install-daemon.sh run-codex-task.sh run-gemini-task.sh; do
  [ -f "$SCRIPT_DIR/$runtime_file" ] && cp "$SCRIPT_DIR/$runtime_file" "$INSTALL_DIR/$runtime_file"
done
chmod +x "$INSTALL_DIR/cockpit-daemon.sh" "$INSTALL_DIR/cockpit" \
  "$INSTALL_DIR/agent-hook-bridge.sh" "$INSTALL_DIR/install-daemon.sh" 2>/dev/null || true
ok "Runtime bundle synced to ${INSTALL_DIR}"

# Keep Claude Stop hook scripts current (autopilot lives here).
if [ -x "$SCRIPT_DIR/install-beacon.sh" ]; then
  bash "$SCRIPT_DIR/install-beacon.sh" --sync 2>/dev/null && ok "Beacon hook scripts synced" || true
fi

# ── Enable and start ──────────────────────────────────────────────────────────
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"

# Kill orphan manual daemons so only systemd owns the singleton lock.
info "Ensuring single daemon instance…"
systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
pkill -f "cockpit-daemon.sh" 2>/dev/null || true
pkill -f "${INSTALL_DIR}/cockpit-daemon.sh" 2>/dev/null || true
sleep 0.5

# Start (or restart after stop above)
if systemctl --user is-active "$SERVICE_NAME" >/dev/null 2>&1; then
  info "Service already running — restarting…"
  systemctl --user restart "$SERVICE_NAME"
else
  systemctl --user start "$SERVICE_NAME"
fi

sleep 1
STATUS=$(systemctl --user is-active "$SERVICE_NAME" 2>/dev/null || echo "failed")

if [ "$STATUS" = "active" ]; then
  ok "Daemon is ${bold}running${reset}."
  printf '\n'
  printf '  %sLogs:%s    journalctl --user -u cockpit-daemon -f\n' "$cyan" "$reset"
  printf '  %sStatus:%s  systemctl --user status cockpit-daemon\n' "$cyan" "$reset"
  printf '  %sStop:%s    systemctl --user stop cockpit-daemon\n'   "$cyan" "$reset"
  printf '  %sRemove:%s  bash scripts/install-daemon.sh --uninstall\n' "$cyan" "$reset"
else
  warn "Service started but status is '${STATUS}'. Check logs:"
  printf '  journalctl --user -u cockpit-daemon -n 30\n'
  exit 1
fi
