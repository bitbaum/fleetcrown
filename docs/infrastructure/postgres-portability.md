# Postgres portability (studio-wide)

---
created_date: 2026-05-22
last_modified_date: 2026-06-16
last_modified_summary: Reflect the completed Hetzner self-hosted reality; drop the dead Oracle/Vercel cutover machinery; keep the vendor-neutral env-var pattern.
---

Goal: **switching Postgres host later is a config + dump/restore job**, not a code rewrite.

Long-form narrative: [The Database Kill Switch](/thoughts/the-database-kill-switch-neon-oracle-and-the-studio-stack).

Applies to FleetCrown first; copy the same env pattern to other Drizzle/Prisma apps in `~/dev`.

## Where things stand

FleetCrown's Postgres is **self-hosted on the Hetzner `bitbaum` box** (Postgres 17
on the host, one role/database per app). The app reads `DATABASE_URL`; there is
no managed-DB vendor in the loop. The one-time migration off Neon (FleetCrown)
and managed Supabase (OrangeCat) completed 2026-06-12 — see
`docs/infrastructure/hetzner-migration.md` for the box layout and history. The
vendor-neutral env pattern below is what made that move a config change rather
than a rewrite, and is what keeps the door open to moving hosts again later.

## Principles

1. **Standard Postgres only** — no vendor-specific SQL, extensions, or SDKs in app code.
2. **Two URLs in production** — direct for migrations/LISTEN; pooled for runtime queries (pooled may equal direct when no pooler is in front).
3. **Local dev never hits prod** — `.env.local` → Docker Postgres on `localhost`.
4. **One database per project** on the shared host — not one managed project per app.
5. **Self-hosted Supabase stays** — OrangeCat/printcraft use auth, RLS, storage via the self-hosted Supabase stack at `supabase.orangecat.ch`; do not force them onto plain Postgres without a rewrite.

## Environment variables (SSOT)

| Variable | Purpose | Who sets it |
|----------|---------|-------------|
| `DATABASE_URL` | **Direct** session (`:5432`) — migrations, `drizzle-kit push`, LISTEN/NOTIFY | app env on the box + local dev |
| `DATABASE_POOL_URL` | **Pooled** session (PgBouncer `:6432`) — app runtime queries | production only (optional; falls back to direct) |

**Local dev:** set `DATABASE_URL` only. Pool URL falls back to the same value.

The legacy `NEON_DATABASE_URL` / `NEON_DATABASE_URL_DIRECT` fallbacks were removed — only the neutral `DATABASE_URL` / `DATABASE_POOL_URL` names are read now.

Implementation: `src/lib/db-url.ts` — `getDatabasePoolUrl()`, `getDatabaseDirectUrl()`.

## Dev vs production

```
┌─────────────────────────────────────────────────────────────┐
│ Laptop: docker compose up db                                │
│   DATABASE_URL=postgresql://fleetcrown:changeme@localhost:5432/fleetcrown
│   (never the prod URL in .env.local)                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Production (self-hosted Next.js on the Hetzner box)         │
│   DATABASE_URL=postgresql://user:pass@host:5432/fleetcrown     │
│   DATABASE_POOL_URL=postgresql://user:pass@host:6432/fleetcrown (only if PgBouncer is in front)
└─────────────────────────────────────────────────────────────┘
```

App code is unchanged when the host changes — only the env URLs move.

## Self-hosted target layout

One VM, Postgres 17, optional PgBouncer (this is the current `bitbaum` setup):

```bash
# On the VM (example)
createdb fleetcrown
createdb kivvi
createdb revampit
# … one DB per project

# PgBouncer (optional) listens on 6432 → forwards to localhost:5432
```

Point each app at its own database name on the same host via its `DATABASE_URL`.

## Migration runbook (when you switch hosts)

### Full database (schema + data)

```bash
# 1. Backup source
DATABASE_URL="$OLD_DIRECT_URL" ./scripts/db/dump.sh fleetcrown-pre-migrate.sql.gz

# 2. Create empty DB on new host, push schema
DATABASE_URL="$NEW_DIRECT_URL" npm run migrate

# 3. Restore
DATABASE_URL="$NEW_DIRECT_URL" ./scripts/db/restore.sh fleetcrown-pre-migrate.sql.gz

# 4. Set DATABASE_URL (+ DATABASE_POOL_URL) in the app env on the box, redeploy
#    (scripts/deploy-hetzner.sh)
# 5. Smoke test sign-in + one CRUD path + Control runtime push
```

### User data only (schema already on target)

```bash
SOURCE_DATABASE_URL="$OLD" TARGET_DATABASE_URL="$NEW" TARGET_USER_ID="<uuid>" \
  ./scripts/db/sync-user-data.sh
```

### Cutover checklist

- [ ] `DATABASE_URL` (direct) and `DATABASE_POOL_URL` (pool, if used) set in the app env
- [ ] Local `.env.local` still points at Docker — not new prod
- [ ] `npm run migrate` succeeds against new direct URL
- [ ] Auth sign-in works
- [ ] Control SSE / runner push updates `runtime_snapshots`
- [ ] Decommission old host after 7 days (keep a cold dump for 30)

## FleetCrown scripts

| Script | Purpose |
|--------|---------|
| `npm run test:db-url` | Assert URL resolution logic |
| `scripts/db/dump.sh` (`npm run db:dump`) | Portable `pg_dump` backup |
| `scripts/db/restore.sh` (`npm run db:restore`) | Restore into target DB |
| `scripts/db/restore-to-target.sh` | Restore + verify row counts against a manifest |
| `scripts/db/sync-user-data.sh` | Copy user-owned rows between DBs |

## What we are *not* doing

- Self-hosted-Supabase-native apps (OrangeCat) stay on Supabase — not migrated to plain Postgres.

## Other projects in `~/dev`

| Pattern | Action |
|---------|--------|
| Drizzle/Prisma + plain Postgres | Use `DATABASE_URL` (+ pool if needed); local Docker only |
| Supabase-native (orangecat, printcraft) | Keep on self-hosted Supabase; skip this doc for DB |
| Local-only (reparaturbonus, datacat) | Already portable — use the same dump/restore pattern |

Extract `src/lib/db-url.ts` into a shared snippet or copy per repo when you migrate another app.
