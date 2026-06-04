#!/usr/bin/env bash
# Oracle Always-Free → FleetCrown studio stack in one script.
#
# Run THIS on the Oracle box (Ubuntu 24.04 ARM) as the default `ubuntu`
# user with sudo. End state after ~10 minutes:
#   - Postgres 17 with `fleetcrown` and `orangecat` roles + databases
#   - v0.6 NOTIFY triggers applied
#   - Bridge (Node) running as systemd `fleetcrown-bridge.service`
#   - Caddy serving HTTPS on a configured subdomain → bridge :4001
#   - Daily backup cron (pg_dump → /backups, retained 30d)
#   - UFW + iptables open ONLY on 22 / 80 / 443 / 5432
#
# Required env vars (or prompt-fill below):
#   FLEETCROWN_DB_PASSWORD    — strong random string, stored in Vercel later
#   ORANGECAT_DB_PASSWORD     — same shape
#   BRIDGE_HOST               — fully-qualified hostname for the bridge, e.g. bridge.fleetcrown.com
#                               (you must point this DNS A record at the Oracle IP BEFORE running,
#                                otherwise Caddy can't get a certificate)
#
# Optional:
#   FLEETCROWN_DUMP_URL       — https URL to a fleetcrown pg_dump .sql file (skips empty DB)
#   ORANGECAT_DUMP_URL        — same for orangecat
#
# Usage:
#   ssh ubuntu@<oracle-ip>
#   FLEETCROWN_DB_PASSWORD='...' ORANGECAT_DB_PASSWORD='...' BRIDGE_HOST=bridge.fleetcrown.com \
#     curl -fsSL https://raw.githubusercontent.com/maonakamoto/fleetcrown/main/scripts/oracle/install.sh | bash

set -euo pipefail

# ── Pre-flight ────────────────────────────────────────────────────────────

[[ "$(id -u)" -eq 0 ]] && { echo "Run as ubuntu user, not root. The script uses sudo where needed." >&2; exit 1; }
command -v sudo >/dev/null || { echo "sudo is required" >&2; exit 1; }

FLEETCROWN_DB_PASSWORD="${FLEETCROWN_DB_PASSWORD:-}"
ORANGECAT_DB_PASSWORD="${ORANGECAT_DB_PASSWORD:-}"
BRIDGE_HOST="${BRIDGE_HOST:-}"

if [[ -z "$FLEETCROWN_DB_PASSWORD" || -z "$ORANGECAT_DB_PASSWORD" || -z "$BRIDGE_HOST" ]]; then
  echo "error: FLEETCROWN_DB_PASSWORD, ORANGECAT_DB_PASSWORD, BRIDGE_HOST must be set" >&2
  echo "       see usage at top of script" >&2
  exit 64
fi

echo "==> Oracle box install starting"
echo "    bridge host: $BRIDGE_HOST"
echo "    fleetcrown db password: $(echo "$FLEETCROWN_DB_PASSWORD" | head -c 4)***"
echo "    orangecat  db password: $(echo "$ORANGECAT_DB_PASSWORD" | head -c 4)***"

# ── Step 1: System packages ───────────────────────────────────────────────

echo "==> [1/7] installing system packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release ufw fail2ban git unzip

# ── Step 2: Open ports (Oracle Security List handles the outer firewall;
#           UFW + iptables handle the OS-level one) ──────────────────────

echo "==> [2/7] opening UFW for 22 / 80 / 443 / 5432"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5432/tcp
sudo ufw --force enable

# Oracle's Ubuntu image has restrictive iptables defaults — open the same
# ports there too. Idempotent: insert at position 6 if not already present.
for port in 80 443 5432; do
  sudo iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$port" -j ACCEPT
done
sudo netfilter-persistent save 2>/dev/null || true

# ── Step 3: Postgres 17 from PGDG (Ubuntu's default is 16) ────────────────

if ! command -v psql >/dev/null || ! psql --version | grep -q ' 17\.'; then
  echo "==> [3/7] installing Postgres 17 from PGDG"
  sudo install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | sudo gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-17 postgresql-client-17
else
  echo "==> [3/7] Postgres 17 already installed"
fi

# Listen on all interfaces, TLS on by default, scram-sha-256 over hostssl.
sudo sed -i "s/^#*listen_addresses.*/listen_addresses = '*'/" /etc/postgresql/17/main/postgresql.conf
sudo sed -i "s/^#*ssl = .*/ssl = on/" /etc/postgresql/17/main/postgresql.conf

# Roles + databases (idempotent — re-running won't error).
sudo -u postgres psql -tAc "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fleetcrown') THEN
    CREATE ROLE fleetcrown WITH LOGIN PASSWORD '$FLEETCROWN_DB_PASSWORD';
  ELSE
    ALTER ROLE fleetcrown WITH PASSWORD '$FLEETCROWN_DB_PASSWORD';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='orangecat') THEN
    CREATE ROLE orangecat WITH LOGIN PASSWORD '$ORANGECAT_DB_PASSWORD';
  ELSE
    ALTER ROLE orangecat WITH PASSWORD '$ORANGECAT_DB_PASSWORD';
  END IF;
END
\$\$;
" >/dev/null

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='fleetcrown'" | grep -q 1 \
  || sudo -u postgres createdb -O fleetcrown fleetcrown
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='orangecat'" | grep -q 1 \
  || sudo -u postgres createdb -O orangecat orangecat

# Per-role pg_hba lines — each role only authenticates to its own database.
sudo tee /etc/postgresql/17/main/pg_hba.conf >/dev/null <<'HBA'
# TYPE  DATABASE     USER         ADDRESS         METHOD

# Local connections from the box itself (used by the bridge + backup cron)
local   all          postgres                     peer
local   fleetcrown   fleetcrown                   scram-sha-256
local   orangecat    orangecat                    scram-sha-256

# Loopback TCP — cleartext is safe on 127.0.0.1; the Node bridge connects via
# pg's TCP driver (not Unix socket), and pg+Postgres-self-signed TLS rejects
# by default. scram-sha-256 password auth is enforced; only 127.0.0.1 allowed.
host    fleetcrown   fleetcrown   127.0.0.1/32    scram-sha-256
host    orangecat    orangecat    127.0.0.1/32    scram-sha-256

# Remote connections — TLS-only, password (scram). Each role only sees its own DB.
hostssl fleetcrown   fleetcrown   0.0.0.0/0       scram-sha-256
hostssl fleetcrown   fleetcrown   ::/0            scram-sha-256
hostssl orangecat    orangecat    0.0.0.0/0       scram-sha-256
hostssl orangecat    orangecat    ::/0            scram-sha-256

# Reject everything else over the network.
hostssl all          all          0.0.0.0/0       reject
hostssl all          all          ::/0            reject
host    all          all          0.0.0.0/0       reject
host    all          all          ::/0            reject
HBA

sudo systemctl restart postgresql

# Wait for Postgres to be back up.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null && break
  sleep 1
done

# ── Step 4: Optionally restore from a dump URL ────────────────────────────

restore_from_url() {
  local target_db="$1" url="$2" role="$3" password="$4"
  [[ -z "$url" ]] && { echo "    no dump URL for $target_db — leaving schema empty"; return 0; }
  echo "    downloading $target_db dump from $url"
  local tmp; tmp=$(mktemp)
  curl -fsSL "$url" -o "$tmp" || { echo "    download failed" >&2; rm -f "$tmp"; return 1; }
  echo "    restoring → $target_db"
  PGPASSWORD="$password" psql -h 127.0.0.1 -U "$role" -d "$target_db" \
    --single-transaction --set ON_ERROR_STOP=on -f "$tmp" >/dev/null
  rm -f "$tmp"
}

echo "==> [4/7] restoring databases (skip if no URL)"
restore_from_url fleetcrown "${FLEETCROWN_DUMP_URL:-}" fleetcrown "$FLEETCROWN_DB_PASSWORD" \
  || echo "    fleetcrown restore skipped/failed (continuing)"
restore_from_url orangecat "${ORANGECAT_DUMP_URL:-}" orangecat "$ORANGECAT_DB_PASSWORD" \
  || echo "    orangecat restore skipped/failed (continuing)"

# Apply v0.6 NOTIFY triggers to fleetcrown. Prefer the local file (pre-staged
# alongside bridge/) over a curl from raw.githubusercontent.com — the latter
# only works if the repo is public.
echo "    applying v0.6 NOTIFY triggers to fleetcrown"
TRIGGER_LOCAL="/opt/fleetcrown/drizzle/0022_notify_triggers.sql"
if [[ -f "$TRIGGER_LOCAL" ]]; then
  PGPASSWORD="$FLEETCROWN_DB_PASSWORD" psql -h 127.0.0.1 -U fleetcrown -d fleetcrown \
    -f "$TRIGGER_LOCAL" >/dev/null 2>&1 \
    || echo "    triggers already present or schema not ready (continuing)"
else
  sudo apt-get install -y -qq curl
  TRIGGER_URL="https://raw.githubusercontent.com/maonakamoto/fleetcrown/main/drizzle/0022_notify_triggers.sql"
  PGPASSWORD="$FLEETCROWN_DB_PASSWORD" psql -h 127.0.0.1 -U fleetcrown -d fleetcrown \
    -f <(curl -fsSL "$TRIGGER_URL") >/dev/null 2>&1 \
    || echo "    triggers already present or schema not ready (continuing)"
fi

# ── Step 5: Node 20 + bridge service ──────────────────────────────────────

if ! command -v node >/dev/null || ! node -v | grep -q '^v20\|^v22'; then
  echo "==> [5/7] installing Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
else
  echo "==> [5/7] Node already installed ($(node -v))"
fi

sudo mkdir -p /opt/fleetcrown
sudo chown ubuntu:ubuntu /opt/fleetcrown
if [[ -n "${FLEETCROWN_LOCAL_SOURCE_DIR:-}" ]]; then
  # Pre-staged via SCP/tarball — the repo is private, so the OracleFree
  # public-clone path doesn't apply. Caller has put bridge/, drizzle/,
  # scripts/ at /opt/fleetcrown already.
  echo "    using pre-staged source (FLEETCROWN_LOCAL_SOURCE_DIR=$FLEETCROWN_LOCAL_SOURCE_DIR)"
  [[ -f /opt/fleetcrown/bridge/package.json ]] || {
    echo "error: /opt/fleetcrown/bridge/package.json not found — did you extract the tarball?" >&2
    exit 1
  }
elif [[ ! -d /opt/fleetcrown/.git ]]; then
  echo "    cloning fleetcrown repo (sparse — bridge/ only)"
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/maonakamoto/fleetcrown.git /opt/fleetcrown
  cd /opt/fleetcrown && git sparse-checkout set bridge drizzle scripts/oracle && cd -
else
  echo "    refreshing existing /opt/fleetcrown checkout"
  cd /opt/fleetcrown && git pull --ff-only && cd -
fi

echo "    building bridge"
cd /opt/fleetcrown/bridge
npm ci --omit=dev --quiet || npm install --omit=dev --quiet
npm install --quiet # need devDeps for tsc build, then prune
npm run build
npm prune --omit=dev --quiet
cd -

echo "    writing /opt/fleetcrown/bridge/.env"
cat <<ENV | sudo tee /opt/fleetcrown/bridge/.env >/dev/null
# sslmode=disable: bridge connects to 127.0.0.1 (loopback) where TLS adds no
# security and the node-postgres pg client rejects Postgres's default
# self-signed cert. pg_hba.conf restricts this role+db to 127.0.0.1 with
# scram-sha-256 password auth — that's the actual security boundary.
DATABASE_URL=postgresql://fleetcrown:${FLEETCROWN_DB_PASSWORD}@127.0.0.1:5432/fleetcrown?sslmode=disable
PORT=4001
ENV
sudo chown ubuntu:ubuntu /opt/fleetcrown/bridge/.env
sudo chmod 600 /opt/fleetcrown/bridge/.env

echo "    installing systemd unit"
sudo tee /etc/systemd/system/fleetcrown-bridge.service >/dev/null <<UNIT
[Unit]
Description=FleetCrown event bridge (Postgres LISTEN → SSE)
After=postgresql.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/fleetcrown/bridge
EnvironmentFile=/opt/fleetcrown/bridge/.env
ExecStart=/usr/bin/node /opt/fleetcrown/bridge/dist/server.js
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now fleetcrown-bridge

# ── Step 6: Caddy for HTTPS in front of the bridge ────────────────────────

echo "==> [6/7] installing Caddy + provisioning TLS cert for $BRIDGE_HOST"
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
fi

sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$BRIDGE_HOST {
  encode zstd gzip
  reverse_proxy 127.0.0.1:4001 {
    # Disable buffering — SSE needs each frame to flush immediately.
    flush_interval -1
  }
  # NOTE: previously had a "log { format filter ... query_replace }" block to
  # redact ck_* tokens from access logs. That custom filter module isn't
  # registered in Caddy v2.11 (verified 2026-06-04). Default access logging
  # goes to journalctl + includes query strings (including the token=ck_*).
  # If/when token-redaction matters, look into Caddy's `regexp` filter
  # encoder or just disable access logs entirely with `log { output stderr }`.
}
CADDY

sudo systemctl restart caddy

# ── Step 7: Daily backups ─────────────────────────────────────────────────

echo "==> [7/7] daily backup cron (pg_dump → /backups, retain 30d)"
sudo mkdir -p /backups
sudo chown postgres:postgres /backups
sudo tee /etc/cron.daily/fleetcrown-backup >/dev/null <<'CRON'
#!/bin/bash
set -e
DATE=$(date +%F)
sudo -u postgres pg_dump fleetcrown | gzip > /backups/fleetcrown-$DATE.sql.gz
sudo -u postgres pg_dump orangecat  | gzip > /backups/orangecat-$DATE.sql.gz
find /backups -name '*-*.sql.gz' -mtime +30 -delete
CRON
sudo chmod +x /etc/cron.daily/fleetcrown-backup

# ── Done ──────────────────────────────────────────────────────────────────

echo
echo "============================================================"
echo "Oracle box ready. Set these on Vercel and redeploy:"
echo
echo "  cockpit (FleetCrown) project:"
echo "    DATABASE_URL=postgresql://fleetcrown:***@${BRIDGE_HOST}:5432/fleetcrown?sslmode=require"
echo "    NEXT_PUBLIC_FLEETCROWN_BRIDGE_URL=https://${BRIDGE_HOST}/sse"
echo
echo "  orangecat project:"
echo "    DATABASE_URL=postgresql://orangecat:***@${BRIDGE_HOST}:5432/orangecat?sslmode=require"
echo
echo "Replace *** with the actual passwords you set as env vars."
echo
echo "Verify locally:"
echo "  systemctl status postgresql fleetcrown-bridge caddy"
echo "  curl -fsSL https://${BRIDGE_HOST}/healthz"
echo
echo "Smoke from your laptop:"
echo "  psql 'postgresql://fleetcrown:***@${BRIDGE_HOST}:5432/fleetcrown?sslmode=require' -c 'SELECT version();'"
echo "============================================================"
