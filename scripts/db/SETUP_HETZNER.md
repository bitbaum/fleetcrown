# Hetzner CX22 — FleetCrown Postgres host setup

A ~€4.5/mo Hetzner CX22 (2 vCPU, 4 GB RAM, 40 GB SSD, Helsinki/Falkenstein/Nuremberg/Ashburn/Hillsboro/Singapore) is more than enough headroom for FleetCrown's traffic and has no egress fees inside the EU. This runbook gets you from "open Hetzner Cloud account" to "Vercel pointed at the new DB" in ~30 min.

## 0. Prereqs

- Hetzner Cloud account
- SSH key uploaded to Hetzner (Console → Security → SSH Keys)
- `pg_dump` available locally (this repo has it via Postgres 17 client tools)

## 1. Provision the box

Console → New project → "FleetCrown DB" → New server:

- Location: closest to your Vercel region (typically Falkenstein for EU, or Ashburn for US East)
- Image: Ubuntu 24.04
- Type: CX22 (or larger if you expect growth — CX32 doubles RAM for ~€8)
- Networking: default IPv4 + IPv6
- SSH keys: select your uploaded key
- Firewall: skip for now (we'll add one in step 4)
- Name: `fleetcrown-db`

Hit Create. Note the public IPv4.

## 2. SSH and install Postgres 17

```bash
ssh root@<server-ip>

# Add the PGDG repo (Ubuntu 24.04's default postgres is 16; we want 17 for parity)
apt update && apt install -y curl ca-certificates gnupg lsb-release
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt update
apt install -y postgresql-17 postgresql-client-17 ufw fail2ban
```

## 3. Create the FleetCrown role + database

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE fleetcrown WITH LOGIN PASSWORD 'CHANGE_ME_BEFORE_USE';
CREATE DATABASE fleetcrown OWNER fleetcrown;
SQL
```

Replace `CHANGE_ME_BEFORE_USE` with a strong random password — use it once below and forget it (store in Vercel env, not in any local file).

## 4. Open Postgres to Vercel (firewall + listen address)

```bash
# Listen on all interfaces (Postgres defaults to localhost only)
sed -i "s/^#listen_addresses.*/listen_addresses = '*'/" /etc/postgresql/17/main/postgresql.conf

# Require SSL for incoming connections (Vercel speaks SSL by default)
sed -i "s/^#ssl = on/ssl = on/" /etc/postgresql/17/main/postgresql.conf

# pg_hba: allow the fleetcrown user from anywhere over SSL with password
echo "hostssl all fleetcrown 0.0.0.0/0 scram-sha-256" >> /etc/postgresql/17/main/pg_hba.conf
echo "hostssl all fleetcrown ::/0      scram-sha-256" >> /etc/postgresql/17/main/pg_hba.conf

systemctl restart postgresql

# UFW: SSH + Postgres only
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 5432/tcp
ufw --force enable
```

**Security note**: opening 5432 to 0.0.0.0/0 means anyone on the internet can attempt password auth. For prod, replace `0.0.0.0/0` with Vercel's egress IP ranges (or use Hetzner's cloud firewall to allowlist Vercel's subnet). Until then, ensure the password is genuinely random and `fail2ban` is active.

## 5. Verify from your laptop

```bash
psql "postgresql://fleetcrown:CHANGE_ME_BEFORE_USE@<server-ip>:5432/fleetcrown?sslmode=require" -c "SELECT version();"
```

Should print Postgres 17.x.

## 6. Restore the dump

```bash
# Locally — assumes you ran scripts/db/dump-from-neon.sh first
TARGET_DATABASE_URL="postgresql://fleetcrown:CHANGE_ME_BEFORE_USE@<server-ip>:5432/fleetcrown?sslmode=require" \
DUMP_FILE="neon-dump-<timestamp>.sql" \
scripts/db/restore-to-target.sh
```

The script verifies row counts against the manifest. If anything mismatches, it halts before you flip Vercel.

## 7. Flip Vercel

```bash
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# paste: postgresql://fleetcrown:CHANGE_ME_BEFORE_USE@<server-ip>:5432/fleetcrown?sslmode=require

# Also DATABASE_POOL_URL if you have it (PgBouncer URL — same content for now,
# Vercel doesn't pool by default).
vercel env rm DATABASE_POOL_URL production || true
vercel env add DATABASE_POOL_URL production

vercel --prod --yes
```

## 8. Smoke test

```bash
curl -s https://fleetcrown.orangecat.ch/api/health
# expect: {"ok":true,"runtime":false,"version":null}

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://fleetcrown.orangecat.ch/api/control/runtime-state \
  -H "Authorization: Bearer ock_..."  # an agent token
# expect: 401 (no body) or 200 (with body)
```

Browse `/control`, `/settings`, `/system` — should load without "Something went wrong."

## 9. Daily care

- `apt update && apt upgrade -y` weekly (or set up unattended-upgrades)
- `pg_dump fleetcrown | gzip > /backups/fleetcrown-$(date +%F).sql.gz` daily via cron
- Snapshot the Hetzner volume via their UI before major schema migrations

## Decommissioning Neon

After 24h of clean operation on Hetzner, you can:
- Pause the Neon project (free tier doesn't charge for paused projects)
- Or delete it entirely if you'd rather not keep the old data around

Either way, keep one full `pg_dump` of Neon in cold storage for at least 30 days before deleting the source — recovering from a botched migration is much harder without it.
