# scripts/db — FleetCrown database toolkit

Portable `pg_dump`/`psql` tooling for FleetCrown's PostgreSQL database, plus
the historical runbooks from the one-time migration onto the self-hosted box.

## Where the database lives now

FleetCrown's Postgres runs **self-hosted on the Hetzner `bitbaum` box**
(`167.233.22.31`), Postgres 17 on the host, one role/database per app. The
app reads its connection string from `DATABASE_URL`. There is no managed-DB
vendor in the loop — the migration off Neon (FleetCrown) and managed Supabase
(OrangeCat) completed 2026-06-12. See `docs/infrastructure/hetzner-migration.md`
for the full box layout and that migration's history.

Deploys go through `scripts/deploy-hetzner.sh` (build → rsync → restart the
`fleetcrown-app` service). Self-hosted Supabase stays at `supabase.orangecat.ch`
for OrangeCat's auth/storage — that is separate from FleetCrown's plain Postgres.

## Files

| File | Purpose |
|---|---|
| `dump.sh` | Portable `pg_dump` of FleetCrown to a `.sql.gz` file. `DATABASE_URL=...` (or `.env.local`). |
| `restore.sh` | Restore a `.sql.gz` dump into a target DB. |
| `restore-to-target.sh` | `psql` a plain-SQL dump into a target, verifying row counts against a manifest; halts on mismatch. |
| `sync-user-data.sh` | Copy user-owned rows between two databases (schema must already exist on the target). |
| `bootstrap-migration-ledger.ts` | Seed `drizzle.__drizzle_migrations` when schema arrived via `push` (one-time). |
| `audit-duplicate-projects.ts` | List case-insensitive duplicate project entities per user. |
| `merge-duplicate-projects.ts` | Merge duplicate project entities (dry run by default; `--apply` to write). Run after imports that created `botsmann` + `Botsmann` pairs. |
| `retire-stale-projects.ts` | Explicit merge/delete list for renamed or obsolete projects (dry run by default; `--apply`). |
| `link-prod-runtime.ts` | Upsert `user_projects.dir_path` for entities missing Fleet Runner links. |
| `list-projects.ts` | Inventory helper — entity attr/goal counts + runtime rows. |
| `SETUP_HETZNER.md` | Provision + install + secure a Hetzner box for Postgres 17. |
| `BOTH_PRODUCTS_ONE_HOST.md` | Layer two databases on one Postgres instance — role + pg_hba setup, capacity math, "when to split" triggers. |

## Backup + restore (routine)

```bash
# Back up production
DATABASE_URL="$PROD_DATABASE_URL" scripts/db/dump.sh fleetcrown-$(date +%F).sql.gz

# Restore into a fresh target (e.g. a new box, or local)
DATABASE_URL="$TARGET_DATABASE_URL" scripts/db/restore.sh fleetcrown-<date>.sql.gz
```

The box also runs a nightly `pg_dump` cron with 14-day retention
(`/opt/backups/nightly/`); see the hetzner-migration doc.

## Moving the database to a new host (if you ever do)

Switching Postgres hosts is a dump/restore + config job, not a code rewrite —
the app only needs `DATABASE_URL` repointed.

1. **Dump source:** `DATABASE_URL="$OLD_URL" scripts/db/dump.sh source.sql.gz`
2. **Stand up target:** follow `SETUP_HETZNER.md` sections 1–5 (Postgres 17,
   role + database, firewall). You end with a working
   `postgresql://fleetcrown:...@<host>:5432/fleetcrown?sslmode=require` URL.
3. **Restore + verify:**
   ```bash
   TARGET_DATABASE_URL="$NEW_URL" DUMP_FILE="source.sql" scripts/db/restore-to-target.sh
   ```
   The script halts if any table row count mismatches the source manifest.
4. **Repoint the app:** set `DATABASE_URL` (and `DATABASE_POOL_URL` if used) in
   the app's env on the box, then redeploy with `scripts/deploy-hetzner.sh`.
5. **Smoke:**
   ```bash
   curl -s https://fleetcrown.orangecat.ch/api/health                              # → 200
   curl -s -o /dev/null -w "%{http_code}\n" https://fleetcrown.orangecat.ch/       # → 200
   ```
   Browse `/control`, `/settings`, `/system` — should load without "Something went wrong."

## Why not Drizzle migrations for data?

`drizzle-kit` syncs schema; data migration is not its job. `pg_dump`/`psql` is
the well-trodden path for "move this database intact," and the SQL output is
auditable in a way binary formats aren't.
