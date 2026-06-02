# Postgres portability (studio-wide)

---
created_date: 2026-05-22
last_modified_date: 2026-05-23
last_modified_summary: Document Oracle bootstrap/cutover scripts and one-console-step flow.
---

Goal: **switching Postgres host later is a config + dump/restore job**, not a code rewrite.

Long-form narrative: [The Database Kill Switch](/thoughts/the-database-kill-switch-neon-oracle-and-the-studio-stack).

Applies to FleetCrown first; copy the same env pattern to other Drizzle/Prisma apps in `~/dev`.

## Principles

1. **Standard Postgres only** — no vendor-specific SQL, extensions, or SDKs in app code.
2. **Two URLs in production** — direct for migrations/LISTEN; pooled for serverless queries.
3. **Local dev never hits cloud** — `.env.local` → Docker Postgres on `localhost`.
4. **One database per project** on a shared host (Oracle/Hetzner) when you migrate — not one Neon project per app.
5. **Supabase stays Supabase** — orangecat/printcraft use auth, RLS, storage; do not force them onto plain Postgres without a rewrite.

## Environment variables (SSOT)

| Variable | Purpose | Who sets it |
|----------|---------|-------------|
| `DATABASE_URL` | **Direct** session (`:5432`) — migrations, `drizzle-kit push`, LISTEN/NOTIFY | Vercel + local dev |
| `DATABASE_POOL_URL` | **Pooled** session (PgBouncer `:6432`, Neon pooler, Supabase pooler) — app runtime queries | Vercel production only |

**Local dev:** set `DATABASE_URL` only. Pool URL falls back to the same value.

**Legacy (FleetCrown still reads these):** `NEON_DATABASE_URL` → pool, `NEON_DATABASE_URL_DIRECT` → direct. Prefer the neutral names on new hosts.

Implementation: `src/lib/db-url.ts` — `getDatabasePoolUrl()`, `getDatabaseDirectUrl()`.

## Dev vs production

```
┌─────────────────────────────────────────────────────────────┐
│ Laptop: docker compose up db                                │
│   DATABASE_URL=postgresql://cockpit:changeme@localhost:5432/cockpit
│   (never the cloud URL in .env.local)                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Vercel (unchanged app code when host changes)               │
│   DATABASE_URL=postgresql://user:pass@host:5432/cockpit     │
│   DATABASE_POOL_URL=postgresql://user:pass@host:6432/cockpit │
└─────────────────────────────────────────────────────────────┘
```

## Self-hosted target layout (Oracle or Hetzner)

One VM, Postgres 17, optional PgBouncer:

```bash
# On the VM (example)
createdb cockpit
createdb kivvi
createdb revampit
# … one DB per project

# PgBouncer listens on 6432 → forwards to localhost:5432
```

Point each Vercel project at its own database name on the same host.

## Migration runbook (when you switch)

### Full database (schema + data)

```bash
# 1. Backup source
DATABASE_URL="$OLD_DIRECT_URL" ./scripts/db/dump.sh cockpit-pre-migrate.sql.gz

# 2. Create empty DB on new host, push schema
DATABASE_URL="$NEW_DIRECT_URL" npm run migrate

# 3. Restore
DATABASE_URL="$NEW_DIRECT_URL" ./scripts/db/restore.sh cockpit-pre-migrate.sql.gz

# 4. Update Vercel env (both URLs), redeploy
# 5. Smoke test sign-in + one CRUD path + Control daemon push
```

### User data only (schema already on target)

```bash
SOURCE_DATABASE_URL="$OLD" TARGET_DATABASE_URL="$NEW" TARGET_USER_ID="<uuid>" \
  ./scripts/db/sync-user-data.sh
```

### Cutover checklist

- [ ] `DATABASE_URL` (direct) and `DATABASE_POOL_URL` (pool) set on Vercel
- [ ] Local `.env.local` still points at Docker — not new prod
- [ ] `npm run migrate` succeeds against new direct URL
- [ ] Auth sign-in works
- [ ] Control SSE / daemon push updates `runtime_snapshots`
- [ ] Decommission old Neon project after 7 days

## FleetCrown scripts

| Script | Purpose |
|--------|---------|
| `npm run test:db-url` | Assert URL resolution logic |
| `scripts/db/dump.sh` | Portable `pg_dump` backup |
| `scripts/db/restore.sh` | Restore into target DB |
| `scripts/db/sync-user-data.sh` | Copy user-owned rows between DBs |
| `scripts/migrate-local-to-neon.sh` | Wrapper → `sync-user-data.sh` |
| `npm run db:oracle-bootstrap` | SSH key + cloud-init for Oracle VM (one-time) |
| `npm run db:oracle-cutover` | Dump Neon → deploy VM stack → restore → Vercel env + redeploy |

## Oracle cutover (minimal manual steps)

1. **One-time on laptop:** `npm run db:oracle-bootstrap` — writes `~/.config/cockpit/oracle-migration.env` and `oracle-cloud-init.yaml`.
2. **One-time in Oracle Console (~5 min):** Create **VM.Standard.A1.Flex** Ubuntu ARM instance; paste cloud-init; note public IP.
3. **Automated:** `ORACLE_HOST=<ip> npm run db:oracle-cutover` — dumps current prod, installs Docker stack on VM, restores, updates Vercel `DATABASE_URL` + `DATABASE_POOL_URL`, redeploys.

Cloud-init template: `infra/postgres-host/cloud-init.yaml`. Public ports: `5432` (direct), `6432` (PgBouncer). Use a strong generated password only — no Neon-style SSL required for initial cutover (`sslmode=disable` on pool URL).

## What we are *not* doing yet

- Supabase-native apps (orangecat) stay on Supabase

## Interim production (2026-05-22)

Neon project `bitbaum-pg` replaced quota-exhausted `ep-bold-shape-…`. See [The Database Kill Switch](/thoughts/the-database-kill-switch-neon-oracle-and-the-studio-stack) for the full postmortem and target architecture (Oracle/Hetzner trunk).

Vercel uses `DATABASE_URL` (direct) + `DATABASE_POOL_URL` (pooler). Local dev uses Docker only.
When the VM is ready, `pg_dump` from bitbaum-pg → restore on self-hosted → update Vercel env.

## Other projects in `~/dev`

| Pattern | Action |
|---------|--------|
| Drizzle/Prisma + Neon | Add `DATABASE_POOL_URL` on Vercel; local Docker only |
| Supabase-native (orangecat, printcraft) | Keep Supabase; skip this doc for DB |
| Local-only (reparaturbonus, datacat) | Already portable — use same dump/restore pattern |

Extract `src/lib/db-url.ts` into a shared snippet or copy per repo when you migrate the second app.
