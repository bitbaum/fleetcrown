#!/usr/bin/env bash
# One-time setup for Oracle migration: SSH key, DB password, cloud-init snippet.
# Run once: ./scripts/db/oracle-bootstrap.sh
# Then create Oracle VM (console) with generated cloud-init, run oracle-cutover.sh

set -euo pipefail

CONFIG_DIR="${HOME}/.config/cockpit"
CONFIG_FILE="${CONFIG_DIR}/oracle-migration.env"
KEY="${CONFIG_DIR}/oracle_ed25519"
CLOUD_INIT_OUT="${CONFIG_DIR}/oracle-cloud-init.yaml"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C "cockpit-oracle-$(date +%Y%m%d)"
  echo "Created SSH key: $KEY"
fi

if [ ! -f "$CONFIG_FILE" ]; then
  PW="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
  cat > "$CONFIG_FILE" <<EOF
# Cockpit Oracle migration — generated $(date -Iseconds)
ORACLE_SSH_KEY=$KEY
ORACLE_SSH_USER=ubuntu
POSTGRES_USER=studio
POSTGRES_PASSWORD=$PW
ORACLE_HOST=
EOF
  chmod 600 "$CONFIG_FILE"
  echo "Wrote $CONFIG_FILE"
else
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

PUBKEY="$(cat "${KEY}.pub")"
sed "s|__SSH_PUBLIC_KEY__|${PUBKEY}|" "$(dirname "$0")/../../infra/postgres-host/cloud-init.yaml" > "$CLOUD_INIT_OUT"

echo ""
echo "=== Oracle bootstrap complete ==="
echo ""
echo "ONE manual step in Oracle Cloud Console (≈5 min):"
echo "  1. Compute → Instances → Create instance"
echo "  2. Shape: VM.Standard.A1.Flex (Ampere) — 1 OCPU, 6 GB RAM is enough"
echo "  3. Image: Ubuntu 22.04 or 24.04 (aarch64)"
echo "  4. Paste cloud-init from: $CLOUD_INIT_OUT"
echo "  5. Note the public IP when the instance is RUNNING"
echo ""
echo "Then run (automated from here):"
echo "  ORACLE_HOST=<public-ip> npm run db:oracle-cutover"
echo ""
echo "Or add ORACLE_HOST to $CONFIG_FILE and run:"
echo "  npm run db:oracle-cutover"
echo ""
