# Both products, one Postgres host

A single Hetzner box (the `bitbaum` box, `167.233.22.31`) hosts both
FleetCrown and OrangeCat's Postgres databases as separate `DATABASE` rows
inside the same Postgres instance. This is the current production setup. This
doc layers on top of `SETUP_HETZNER.md` — the box itself is the same; only the
role + database setup differs.

> Note: OrangeCat's *application* data lives in the self-hosted Supabase stack
> at `supabase.orangecat.ch` (its own PG15 container) for auth/storage/RLS.
> The "orangecat" database on the host Postgres below is the pattern for any
> plain-Postgres app you colocate; see `docs/infrastructure/hetzner-migration.md`
> for which app uses which.

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
# FleetCrown app DATABASE_URL
postgresql://fleetcrown:CHANGE_ME_FLEETCROWN@<host>:5432/fleetcrown?sslmode=require

# OrangeCat app DATABASE_URL
postgresql://orangecat:CHANGE_ME_ORANGECAT@<host>:5432/orangecat?sslmode=require
```

Each app reads its `DATABASE_URL` from its env on the box. When the app and
Postgres share the box (current setup), use the localhost/private host instead
of the public IP and you can drop the public firewall rules in SETUP_HETZNER §4.

## Colocating another app on the box

To stand up another plain-Postgres app's database on the shared instance:

1. **Add a role + database** (this doc's role-setup section) — one role per app,
   each owning only its own DB.
2. **Add its pg_hba rule** ABOVE the `reject` block (first match wins; see above).
3. **Load its data** — `pg_dump` the source, then restore into the new DB:
   ```bash
   DATABASE_URL=<source-url> scripts/db/dump.sh app.sql.gz
   TARGET_DATABASE_URL=<host-url> DUMP_FILE=app.sql scripts/db/restore-to-target.sh
   ```
   `restore-to-target.sh` verifies row counts against the manifest and halts on
   mismatch.
4. **Point the app at `DATABASE_URL`** in its env on the box, then redeploy
   (`scripts/deploy-hetzner.sh` for FleetCrown; per-app deploy script otherwise).

> Historical note: FleetCrown migrated off Neon and OrangeCat off managed
> Supabase onto this box on 2026-06-12. That one-time migration (and the now
> self-hosted Supabase stack that serves OrangeCat's auth/storage) is recorded
> in `docs/infrastructure/hetzner-migration.md`.

## Auth — what runs where

| Product | Auth system | Notes |
|---|---|---|
| FleetCrown | Auth.js v5 with GitHub OAuth | session tables in `public` on the `fleetcrown` host DB |
| OrangeCat | Supabase Auth (gotrue) | runs in the **self-hosted Supabase stack** at `supabase.orangecat.ch` (own PG15 container) — not a managed Supabase project |

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

A long-running self-hosted Next.js server holds a stable connection pool, so at
this scale pooling is rarely the bottleneck (Postgres handles ~100-200
connections per default config). If a connection-heavy workload starts seeing
`FATAL: sorry, too many clients already`, install PgBouncer in
transaction-pooling mode:

```bash
apt install -y pgbouncer
# /etc/pgbouncer/pgbouncer.ini — pool_mode=transaction, max_client_conn=1000
```

Then point the app's `DATABASE_POOL_URL` at PgBouncer (port 6432) and leave
`DATABASE_URL` on direct (port 5432) for migrations.

## When to split the box

Watch these metrics. Migrate one product to its own box when any sustains:

- CPU > 70% averaged over an hour
- RAM cache hit ratio < 95% (queries hitting disk too often)
- p95 query latency > 50ms

Until then, the consolidated setup is the right call. Hetzner's CX-family
upgrades in place — you can bump CX22 → CX32 (4→8GB) with ~5 min reboot,
no migration needed.
