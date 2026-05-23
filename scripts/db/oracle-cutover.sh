#!/usr/bin/env bash
# Migrate Cockpit production Postgres: Neon → Oracle VM (minimal manual steps).
#
# Prerequisites (one-time):
#   ./scripts/db/oracle-bootstrap.sh
#   Create Oracle VM with generated cloud-init (~5 min in console)
#
# Usage:
#   ORACLE_HOST=1.2.3.4 npm run db:oracle-cutover
#   npm run db:oracle-cutover   # if ORACLE_HOST is in ~/.config/cockpit/oracle-migration.env
#
# This script: dump prod → deploy docker on VM → restore → update Vercel → redeploy.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG_FILE="${COCKPIT_ORACLE_CONFIG:-${HOME}/.config/cockpit/oracle-migration.env}"
BACKUP="${ROOT}/backups/oracle-cutover-$(date +%Y%m%d-%H%M%S).sql.gz"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Run ./scripts/db/oracle-bootstrap.sh first." >&2
  exit 2
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

ORACLE_HOST="${ORACLE_HOST:-${1:-}}"
if [ -z "$ORACLE_HOST" ]; then
  echo "Set ORACLE_HOST (public IP of Oracle VM)." >&2
  echo "  ORACLE_HOST=x.x.x.x npm run db:oracle-cutover" >&2
  exit 2
fi

SSH_KEY="${ORACLE_SSH_KEY:?}"
SSH_USER="${ORACLE_SSH_USER:-ubuntu}"
PGUSER="${POSTGRES_USER:-studio}"
PGPASS="${POSTGRES_PASSWORD:?}"

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key missing: $SSH_KEY" >&2
  exit 2
fi

SOURCE_URL="${SOURCE_DATABASE_URL:-}"
if [ -z "$SOURCE_URL" ] && [ -f "$ROOT/.env.vercel.production" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.vercel.production"
  set +a
  SOURCE_URL="${DATABASE_URL:-}"
fi
if [ -z "$SOURCE_URL" ]; then
  echo "SOURCE_DATABASE_URL or .env.vercel.production DATABASE_URL required." >&2
  exit 2
fi

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -i "$SSH_KEY" "${SSH_USER}@${ORACLE_HOST}")
SCP=(scp -o StrictHostKeyChecking=accept-new -i "$SSH_KEY")

echo "=== 1/6 Waiting for SSH on ${ORACLE_HOST} ==="
for i in $(seq 1 30); do
  if "${SSH[@]}" "echo ok" 2>/dev/null; then break; fi
  if [ "$i" -eq 30 ]; then echo "SSH not ready. Is the VM running with cloud-init?" >&2; exit 1; fi
  sleep 10
done

echo "=== 2/6 Dumping production database ==="
mkdir -p "${ROOT}/backups"
DATABASE_URL="$SOURCE_URL" bash "$ROOT/scripts/db/dump.sh" "$BACKUP"

echo "=== 3/6 Deploying Postgres stack on VM ==="
HOST_DIR="/home/${SSH_USER}/cockpit-postgres-host"
"${SSH[@]}" "mkdir -p ${HOST_DIR}/init"
"${SCP[@]}" -r "$ROOT/infra/postgres-host/docker-compose.yml" \
  "$ROOT/infra/postgres-host/docker-compose.public.yml" \
  "${SSH_USER}@${ORACLE_HOST}:${HOST_DIR}/"
"${SCP[@]}" "$ROOT/infra/postgres-host/init/"*.sh "${SSH_USER}@${ORACLE_HOST}:${HOST_DIR}/init/"

REMOTE_ENV="${HOST_DIR}/.env"
"${SSH[@]}" "cat > ${REMOTE_ENV}" <<EOF
POSTGRES_USER=${PGUSER}
POSTGRES_PASSWORD=${PGPASS}
EOF

"${SSH[@]}" bash <<REMOTE
set -euo pipefail
cd ${HOST_DIR}
chmod +x init/*.sh
sudo docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.public.yml \
  up -d
for i in \$(seq 1 30); do
  if sudo docker compose exec -T postgres pg_isready -U ${PGUSER} >/dev/null 2>&1; then break; fi
  sleep 2
done
sudo docker compose exec -T postgres psql -U ${PGUSER} -d postgres -c "SELECT 1 FROM pg_database WHERE datname='cockpit'" | grep -q 1 || \
  sudo docker compose exec -T postgres psql -U ${PGUSER} -d postgres -c "CREATE DATABASE cockpit;"
REMOTE

echo "=== 4/6 Restoring dump into cockpit database ==="
DIRECT="postgresql://${PGUSER}:${PGPASS}@${ORACLE_HOST}:5432/cockpit"
gunzip -c "$BACKUP" | psql "$DIRECT" -v ON_ERROR_STOP=1 -q

POOL="postgresql://${PGUSER}:${PGPASS}@${ORACLE_HOST}:6432/cockpit?sslmode=disable"

echo "=== 5/6 Updating Vercel production env ==="
cd "$ROOT"
vercel env rm DATABASE_URL production -y 2>/dev/null || true
printf '%s' "$DIRECT" | vercel env add DATABASE_URL production
vercel env rm DATABASE_POOL_URL production -y 2>/dev/null || true
printf '%s' "$POOL" | vercel env add DATABASE_POOL_URL production

echo "=== 6/6 Redeploying production ==="
if npm run build >/tmp/cockpit-build.log 2>&1; then
  vercel deploy --prod --yes 2>&1 | tail -5
else
  echo "Build failed — redeploying last known good deployment with new DB env..."
  LAST=$(vercel ls --prod 2>/dev/null | awk '/Ready/ {print $2; exit}')
  if [ -n "$LAST" ]; then
    vercel redeploy "$LAST" --target production 2>&1 | tail -5
  else
    echo "Could not redeploy. Update env manually and redeploy from Vercel dashboard." >&2
    exit 1
  fi
fi

echo ""
echo "=== Cutover complete ==="
echo "  Direct : ${DIRECT}"
echo "  Pool   : ${POOL}"
echo "  Backup : ${BACKUP}"
echo ""
curl -sS "https://cockpitapp.vercel.app/api/setup" || true
echo ""
