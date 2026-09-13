# Hetzner CX22 — Loki Postgres host setup

A ~€4.5/mo Hetzner CX22 (2 vCPU, 4 GB RAM, 40 GB SSD, Helsinki/Falkenstein/Nuremberg/Ashburn/Hillsboro/Singapore) is more than enough headroom for Loki's traffic and has no egress fees inside the EU. This runbook gets you from "open Hetzner Cloud account" to "the app pointed at the new DB" in ~30 min.

> This is Loki's current production database setup — Postgres 17 self-hosted on the Hetzner `bitbaum` box. The app and DB both live on the box; deploys go through `scripts/deploy-hetzner.sh`.

## 0. Prereqs

- Hetzner Cloud account
- SSH key uploaded to Hetzner (Console → Security → SSH Keys)
- `pg_dump` available locally (this repo has it via Postgres 17 client tools)

## 1. Provision the box

Console → New project → "Loki DB" → New server:

- Location: closest to your users (typically Falkenstein for EU, or Ashburn for US East)
- Image: Ubuntu 24.04
- Type: CX22 (or larger if you expect growth — CX32 doubles RAM for ~€8)
- Networking: default IPv4 + IPv6
- SSH keys: select your uploaded key
- Firewall: skip for now (we'll add one in step 4)
- Name: `loki-db`

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

## 3. Create the Loki role + database

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE loki WITH LOGIN PASSWORD 'CHANGE_ME_BEFORE_USE';
CREATE DATABASE loki OWNER loki;
SQL
```

Replace `CHANGE_ME_BEFORE_USE` with a strong random password — use it once below and forget it (store in the app's env on the box, e.g. `~/.db-credentials`, chmod 600 — not in any repo file).

## 4. Open Postgres to the app (firewall + listen address)

> If the app runs on the same box as Postgres (the current `bitbaum` setup), keep Postgres bound to `localhost`/the private interface and skip the public `0.0.0.0/0` rule below — the firewall section is only for the case where the app connects from a different host.

```bash
# Listen on all interfaces (Postgres defaults to localhost only)
sed -i "s/^#listen_addresses.*/listen_addresses = '*'/" /etc/postgresql/17/main/postgresql.conf

# Require SSL for incoming connections
sed -i "s/^#ssl = on/ssl = on/" /etc/postgresql/17/main/postgresql.conf

# pg_hba: allow the loki user from anywhere over SSL with password
echo "hostssl all loki 0.0.0.0/0 scram-sha-256" >> /etc/postgresql/17/main/pg_hba.conf
echo "hostssl all loki ::/0      scram-sha-256" >> /etc/postgresql/17/main/pg_hba.conf

systemctl restart postgresql

# UFW: SSH + Postgres only
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 5432/tcp
ufw --force enable
```

**Security note**: opening 5432 to 0.0.0.0/0 means anyone on the internet can attempt password auth. Prefer NOT to expose Postgres publicly — keep the app on the same box (current setup) so Postgres only listens locally. If you must reach it from another host, allowlist that host's IP via Hetzner's cloud firewall instead of `0.0.0.0/0`, ensure the password is genuinely random, and keep `fail2ban` active.

## 5. Verify from your laptop

```bash
psql "postgresql://loki:CHANGE_ME_BEFORE_USE@<server-ip>:5432/loki?sslmode=require" -c "SELECT version();"
```

Should print Postgres 17.x.

## 6. Restore the dump

```bash
# Locally — assumes you produced a dump with scripts/db/dump.sh first
TARGET_DATABASE_URL="postgresql://loki:CHANGE_ME_BEFORE_USE@<server-ip>:5432/loki?sslmode=require" \
DUMP_FILE="loki-<timestamp>.sql" \
scripts/db/restore-to-target.sh
```

The script verifies row counts against the manifest. If anything mismatches, it halts before you point the app at the new DB.

## 7. Point the app at the new DB

Set `DATABASE_URL` (and `DATABASE_POOL_URL` if you run PgBouncer) in the app's
env on the box — for the `bitbaum` setup these live in the app's `.env` /
`~/.db-credentials` (chmod 600), never in the repo:

```bash
DATABASE_URL="postgresql://loki:CHANGE_ME_BEFORE_USE@<server-ip>:5432/loki?sslmode=require"
# DATABASE_POOL_URL=... only if PgBouncer (port 6432) is in front

# Then rebuild + restart the app:
scripts/deploy-hetzner.sh
```

## 8. Smoke test

```bash
curl -s https://loki.orangecat.ch/api/health
# expect: {"ok":true,"runtime":false,"version":null}

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://loki.orangecat.ch/api/control/runtime-state \
  -H "Authorization: Bearer ock_..."  # an agent token
# expect: 401 (no body) or 200 (with body)
```

Browse `/control`, `/settings`, `/system` — should load without "Something went wrong."

## 9. Daily care

- `apt update && apt upgrade -y` weekly (or set up unattended-upgrades)
- `pg_dump loki | gzip > /backups/loki-$(date +%F).sql.gz` daily via cron
- Snapshot the Hetzner volume via their UI before major schema migrations

## Decommissioning the old host

If you migrated from a previous database host, after 24h of clean operation on
the new box you can tear the old one down. Keep one full `pg_dump` of the old
source in cold storage for at least 30 days before deleting it — recovering
from a botched migration is much harder without it.

(Loki's own one-time migration off Neon completed 2026-06-12 and is
already decommissioned; see `docs/infrastructure/hetzner-migration.md`.)
