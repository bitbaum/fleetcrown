# scripts/db — FleetCrown + OrangeCat database migration toolkit

These scripts and runbooks let you migrate both products' production
databases off their managed-DB providers (Neon for FleetCrown, Supabase
for OrangeCat) and onto a single self-hosted Hetzner Postgres box in
~30 min.

## Why this exists

Both Neon and Supabase price on data transfer / row-egress beyond a
generous-looking free tier, then cliff into "upgrade or be silently
broken" once you trip a cap. We hit Neon's wall in early-June 2026 —
every DB-dependent endpoint 500'd until the cap reset. Supabase's caps
are similar in shape; OrangeCat would hit them eventually.

Self-hosting on a Hetzner CX22 (€4.51/mo) eliminates that class of
failure entirely. Vercel-to-VM egress is uncharged on a box you
control.

A CX22 is over-provisioned for both products combined at today's scale
— see `BOTH_PRODUCTS_ONE_HOST.md` for capacity math.

## Files

| File | Purpose |
|---|---|
| `dump-from-neon.sh` | `pg_dump` FleetCrown out of Neon to a plain SQL file + row-count manifest. |
| `dump-from-supabase.sh` | Same shape for OrangeCat. Defaults to `public` schema only (auth/storage stay on Supabase). `FULL_DUMP=1` for everything. |
| `restore-to-target.sh` | `psql` either dump into a fresh target, verify row counts match the manifest. Halts before flipping Vercel if anything mismatches. |
| `SETUP_HETZNER.md` | Provision + install + secure a Hetzner CX22 for Postgres 17. |
| `BOTH_PRODUCTS_ONE_HOST.md` | Layer two databases on one Postgres instance — role + pg_hba + Vercel env setup, plus capacity math and a "when to split" trigger list. |

## End-to-end migration (cookbook)

For migrating **both products together**, follow `BOTH_PRODUCTS_ONE_HOST.md`
— it sequences FleetCrown first (it's the broken one), OrangeCat second.
The steps below cover one product at a time.

### Step 1 — dump source

**FleetCrown / Neon:**
```bash
SOURCE_DATABASE_URL="$(vercel env pull --environment=production /tmp/env >/dev/null && grep ^DATABASE_URL= /tmp/env | cut -d= -f2- | tr -d '"')" \
  scripts/db/dump-from-neon.sh
```

**OrangeCat / Supabase:**
```bash
# Use the DIRECT URL (port 5432), NOT the pooler (port 6543).
# Supabase dashboard → Settings → Database → Connection string → "Direct connection"
SOURCE_DATABASE_URL="postgresql://postgres:...@db.<project>.supabase.co:5432/postgres" \
  scripts/db/dump-from-supabase.sh
```

Outputs (same shape for both):
- `<source>-dump-<timestamp>.sql`
- `<source>-dump-<timestamp>.manifest.txt`

If Neon fails with "Your project has exceeded the data transfer quota,"
either upgrade the Neon plan once (just long enough to dump) OR wait for
the monthly reset. Supabase's caps are different — they typically allow
dumps even past the cap as long as the direct connection still responds.

### Step 2 — stand up target

Follow `SETUP_HETZNER.md` sections 1-5.

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
curl -s https://fleetcrown.orangecat.ch/api/health    # → 200
curl -s -o /dev/null -w "%{http_code}\n" https://fleetcrown.orangecat.ch/  # → 200
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
