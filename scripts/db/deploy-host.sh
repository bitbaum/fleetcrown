#!/usr/bin/env bash
# Bootstrap Postgres host on a fresh Hetzner Ubuntu VM.
#
# Usage (on the VM):
#   curl -fsSL https://raw.githubusercontent.com/.../deploy-host.sh | bash
# Or copy infra/postgres-host/ to the VM and run:
#   cd infra/postgres-host && cp .env.example .env && $EDITOR .env && ./deploy-host.sh
#
# After deploy:
#   DATABASE_URL=postgresql://studio:PASS@HOST:5432/cockpit
#   DATABASE_POOL_URL=postgresql://studio:PASS@HOST:6432/cockpit
# The app connects over localhost on the same box, so keep :5432/:6432 bound
# to localhost only. Open the firewall (or use a tunnel) only for remote access.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_DIR="$DIR/../../infra/postgres-host"

if [ ! -f "$HOST_DIR/.env" ]; then
  echo "Create $HOST_DIR/.env from .env.example first." >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
fi

chmod +x "$HOST_DIR/init/"*.sh 2>/dev/null || true
docker compose -f "$HOST_DIR/docker-compose.yml" --env-file "$HOST_DIR/.env" up -d

echo ""
echo "Postgres host is up (localhost-only ports bound — open firewall or tunnel for remote access)."
echo "Next: set DATABASE_URL in the app .env → push schema with npm run db:push"
