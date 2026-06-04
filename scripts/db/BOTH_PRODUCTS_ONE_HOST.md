# Both products, one Postgres host

A single Hetzner CX22 (€4.51/mo) or Oracle Always-Free A1.Flex hosts both
FleetCrown and OrangeCat's Postgres databases as separate `DATABASE` rows
inside the same Postgres instance. This doc layers on top of
`SETUP_HETZNER.md` / `SETUP_ORACLE_FREE.md` — the box itself is the same;
only the role + database setup differs.

## Why one box, two databases

| Factor | One box, two DBs | Two separate boxes |
|---|---|---|
| Cost | €4.50/mo total | €9/mo |
| Operational surface | 1 OS, 1 Postgres, 1 backup job | 2 of each |
| Logical isolation | databases — strong (different roles, no cross-DB joins by default) | physical — strongest |
| Failure blast radius | one product's load spike CAN slow the other | full isolation |
| Cross-product reads (e.g. FC reading OC stakeholders) | `postgres_fdw` makes this an option | only over HTTP via SDK |

At today's scale (both products are single-user) the consolidated option
is obvious. When either product hits sustained 70% CPU on the shared box,
that's the signal to split.

## Role + database setup (replaces step 3 of SETUP_HETZNER.md)

```bash
sudo -u postgres psql <<'SQL'
-- Two roles, two databases. Each role owns and can only access its own DB.
CREATE ROLE fleetcrown WITH LOGIN PASSWORD 'CHANGE_ME_FLEETCROWN';
CREATE ROLE orangecat  WITH LOGIN PASSWORD 'CHANGE_ME_ORANGECAT';

CREATE DATABASE fleetcrown OWNER fleetcrown;
CREATE DATABASE orangecat  OWNER orangecat;

-- Belt-and-braces revoke: even the SUPERUSER's connections from outside
-- shouldn't touch the other product's DB. (`pg_hba.conf` enforces this
-- more strictly; this is a second layer.)
REVOKE ALL ON DATABASE fleetcrown FROM orangecat;
REVOKE ALL ON DATABASE orangecat  FROM fleetcrown;
SQL
```

## pg_hba.conf — auth rules per role

Append to `/etc/postgresql/17/main/pg_hba.conf`:

```
# Each product role can only authenticate to its own database.
# Order matters — first matching line wins.
hostssl fleetcrown fleetcrown 0.0.0.0/0 scram-sha-256
hostssl fleetcrown fleetcrown ::/0      scram-sha-256
hostssl orangecat  orangecat  0.0.0.0/0 scram-sha-256
hostssl orangecat  orangecat  ::/0      scram-sha-256
# Reject all other combinations.
hostssl all all 0.0.0.0/0 reject
hostssl all all ::/0      reject
```

`systemctl restart postgresql` after editing.

## Connection URLs

```
# FleetCrown / Vercel `cockpit` project DATABASE_URL
postgresql://fleetcrown:CHANGE_ME_FLEETCROWN@<host>:5432/fleetcrown?sslmode=require

# OrangeCat / Vercel `orangecat` project DATABASE_URL
postgresql://orangecat:CHANGE_ME_ORANGECAT@<host>:5432/orangecat?sslmode=require
```

## Migrate both — order of operations

Sequence so you never have both products half-migrated:

1. **Provision box** (SETUP_HETZNER.md sections 1, 2, 4, 5; this doc's role-setup section).
2. **FleetCrown first** (it's already broken — quickest restore = quickest user value):
   - `cd ~/dev/fleetcrown && SOURCE_DATABASE_URL=<neon-url> scripts/db/dump-from-neon.sh`
   - `TARGET_DATABASE_URL=<hetzner-fc-url> DUMP_FILE=neon-dump-*.sql scripts/db/restore-to-target.sh`
   - Vercel: `vercel env rm DATABASE_URL production && vercel env add DATABASE_URL production` (paste FC URL) → `vercel --prod --yes`
   - Smoke: `curl https://fleetcrown.vercel.app/api/health`, browse `/control`.
3. **OrangeCat second** (still on Supabase, lower urgency):
   - `cd ~/dev/orangecat && SOURCE_DATABASE_URL=<supabase-direct-url> ../fleetcrown/scripts/db/dump-from-supabase.sh`
   - `TARGET_DATABASE_URL=<hetzner-oc-url> DUMP_FILE=supabase-dump-*.sql ../fleetcrown/scripts/db/restore-to-target.sh`
   - Vercel `orangecat` project: env swap → redeploy.
   - Smoke: browse `orangecat.ch`.
4. **Wait 24h** of clean operation on both, then pause Neon + Supabase projects.

## Auth — what stays where

| Product | Auth system | After migration |
|---|---|---|
| FleetCrown | Auth.js v5 with GitHub OAuth | session tables in `public` — moves with the dump, just works |
| OrangeCat | Supabase Auth (gotrue) | **stays on Supabase Auth** by default. Cheaper to keep using Supabase's free auth tier than to self-host gotrue. |

If OrangeCat keeps using Supabase Auth, you keep the Supabase project alive
just for `auth.*` calls. Cost: $0 up to 50k MAU. Total monthly cost for
both products' infrastructure: ~€4.50.

To fully self-host OrangeCat auth, set `FULL_DUMP=1` on the Supabase dump
script and stand up your own gotrue alongside Postgres — that's a bigger
project for another day.

## Backups

One cron for both databases. Add to root crontab on the Hetzner box:

```
0 2 * * * sudo -u postgres pg_dump fleetcrown | gzip > /backups/fleetcrown-$(date +\%F).sql.gz
5 2 * * * sudo -u postgres pg_dump orangecat  | gzip > /backups/orangecat-$(date +\%F).sql.gz
0 3 * * * find /backups -name '*-*.sql.gz' -mtime +30 -delete
0 4 * * 0 rsync -a /backups/ <off-box-destination>:/backups-mirror/  # weekly off-box sync
```

Off-box destination: Hetzner Storage Box (€3.20/mo for 1TB), or any S3-compatible
endpoint. The mirror is your "earthquake destroyed the datacenter" insurance.

## Connection pooling

Vercel functions are short-lived → many short-lived connections. At low scale
this is fine (Postgres handles ~100-200 connections per default config). If
you start seeing `FATAL: sorry, too many clients already`, install PgBouncer
in transaction-pooling mode:

```bash
apt install -y pgbouncer
# /etc/pgbouncer/pgbouncer.ini — pool_mode=transaction, max_client_conn=1000
```

Then point Vercel `DATABASE_POOL_URL` at PgBouncer (port 6432) and leave
`DATABASE_URL` on direct (port 5432) for migrations.

## When to split the box

Watch these metrics. Migrate one product to its own box when any sustains:

- CPU > 70% averaged over an hour
- RAM cache hit ratio < 95% (queries hitting disk too often)
- p95 query latency > 50ms

Until then, the consolidated setup is the right call. Hetzner's CX-family
upgrades in place — you can bump CX22 → CX32 (4→8GB) with ~5 min reboot,
no migration needed.
