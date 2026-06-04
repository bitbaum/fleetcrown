# scripts/db — FleetCrown database migration toolkit

These scripts and runbooks let you migrate the FleetCrown production database
between hosts in ~30 min (Hetzner) or ~1 hour (Oracle Free Tier), without
guessing at the order of operations.

## Why this exists

Neon's free tier capped FleetCrown's data transfer in early-June 2026 and
took down every DB-dependent endpoint until the cap reset. Self-hosting on
a Hetzner CX22 (€4.5/mo) or Oracle Free Tier (free forever) eliminates that
class of failure — egress to Vercel is uncharged on a VM you control.

## Files

| File | Purpose |
|---|---|
| `dump-from-neon.sh` | `pg_dump` the source DB to a plain SQL file + manifest of row counts. |
| `restore-to-target.sh` | `psql` the dump into a fresh target, verify row counts match the manifest. |
| `SETUP_HETZNER.md` | Provision + install + secure a Hetzner CX22 for Postgres 17. |
| `SETUP_ORACLE_FREE.md` | Same, for Oracle Always-Free ARM. |

## End-to-end migration (cookbook)

### Step 1 — dump source

```bash
SOURCE_DATABASE_URL="$(vercel env pull --environment=production /tmp/env >/dev/null && grep ^DATABASE_URL= /tmp/env | cut -d= -f2- | tr -d '"')" \
  scripts/db/dump-from-neon.sh
```

Outputs:
- `neon-dump-<timestamp>.sql`
- `neon-dump-<timestamp>.manifest.txt`

If this fails with "Your project has exceeded the data transfer quota," you
must either upgrade the Neon plan once (just long enough to dump) OR wait
for the monthly reset. The script otherwise streams as fast as Neon allows.

### Step 2 — stand up target

Pick one:
- **Hetzner** (recommended for paid simplicity): follow `SETUP_HETZNER.md` sections 1-5.
- **Oracle Free**: follow `SETUP_ORACLE_FREE.md` sections 1-5.

You end with a working `postgresql://fleetcrown:...@<host>:5432/fleetcrown?sslmode=require` URL.

### Step 3 — restore + verify

```bash
TARGET_DATABASE_URL="postgresql://fleetcrown:...@<host>:5432/fleetcrown?sslmode=require" \
DUMP_FILE="neon-dump-<timestamp>.sql" \
  scripts/db/restore-to-target.sh
```

The script halts if any table row count mismatches the source manifest.

### Step 4 — flip Vercel

```bash
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# paste the new URL
vercel env rm DATABASE_POOL_URL production || true
vercel env add DATABASE_POOL_URL production
# paste the new URL

vercel --prod --yes
```

### Step 5 — smoke

```bash
curl -s https://fleetcrown.vercel.app/api/health    # → 200
curl -s -o /dev/null -w "%{http_code}\n" https://fleetcrown.vercel.app/  # → 200
```

Browse `/control`, `/settings`, `/system` — should load without "Something went wrong."

### Step 6 — keep Neon dump cold

After 24h of clean operation, pause Neon. Keep the dump file in cold
storage (`tar czf neon-dump-<timestamp>.tgz neon-dump-<timestamp>.{sql,manifest.txt} && mv neon-dump-<timestamp>.tgz ~/backups/`)
for at least 30 days before deleting the Neon project entirely.

## Why not Drizzle migrations?

Drizzle's `drizzle-kit push` syncs schema, but data migration is not its
job. `pg_dump`/`psql` is the well-trodden path for "move this database
intact," and the SQL output is auditable in a way binary formats aren't.
