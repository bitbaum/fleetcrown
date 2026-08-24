# AGENTS.md — FleetCrown

created_date: 2026-06-01
last_modified_date: 2026-08-17
last_modified_summary: Local `.env` cloud URLs (Neon/Vercel) are not production SSOT; the box is.

Operational quick-reference for agents working in this repo. Deep conventions
(design system, SSOT rules, view map) live in `CLAUDE.md`; read it too.

## What this is

FleetCrown — a personal life OS and multi-user SaaS for commanding AI agent
fleets across projects. Users sign in (GitHub OAuth), register projects, and
launch/monitor agents from one dashboard.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript strict** — no `any` without justification
- **Tailwind CSS 4 + shadcn/ui** — always dark (`.dark` on `html`)
- **Drizzle ORM** — schema is SSOT for types
- **PostgreSQL 17** — self-hosted, `fleetcrown` database

## Layout

```
src/app/          Pages + API routes (thin; delegate to queries/components)
src/components/   UI (ui/ primitives, shell/, control/, loki/, terminal/, …)
src/config/       SSOT for navigation, channels, prompt-library, subscriptions
src/db/schema/    Drizzle tables — SSOT for all types
src/db/queries/   Data access (one file per domain)
src/lib/          constants, dates, tools, api wrappers, session, db-url
home/             Local-first agent orchestration (runs on the user's machine)
scripts/          deploy, tests, db tooling, generators
drizzle/          Versioned migration files + meta/ (journal + snapshot)
docs/             Architecture + infrastructure notes
```

## Dev commands

```bash
npm run dev        # dev server (port 3000)
npm run build      # production build
npm run smoke      # curl every route on :3000, assert 2xx/3xx (needs dev server)
npm run test:home  # home/ inline self-test suites (~14s)
```

## verify (the one canonical gate)

```bash
npm run verify
# = tsc --noEmit && npm run lint && npm run check:design
#   && npm run test:unit && npm run test:home
```

CI (`.github/workflows/ci.yml`) runs `npm run verify` **verbatim** — green local
verify ⇒ green CI. Run it before declaring any change done. A husky pre-commit
hook runs `tsc --noEmit` + `eslint`; pre-push runs `test:home` (+ `smoke` when
the dev server is up).

## Database & schema (see `docs/infrastructure/migration-strategy.md`)

- **Schema (SSOT):** `src/db/schema/` — types via `$inferSelect` / `$inferInsert`.
- **Migrations:** `drizzle/NNNN_*.sql`, meta in `drizzle/meta/`.
- **Change flow:** edit schema → `npm run db:generate` (versioned file) →
  review the SQL in the PR → the deploy applies it forward-only.
- **Raw-SQL migrations** (`scripts/db/migrations/NNN_*.sql`, e.g. 074/075) are
  hand-applied via `npm run db:apply-box -- <file>` (runs as the app role so
  objects are owned by `fleetcrown`). The deploy's `apply-schema.sh` does NOT
  auto-apply these — apply them to the box **and** local dev *before* the code
  reaches `main`, or the drift-gate rolls the deploy back.
- **`drizzle-kit push` is for a throwaway local/scratch DB only** — never a
  shared or production database. (The `migrate` script currently aliases `push`;
  a rename is proposed in the migration-strategy doc.)
- Every table has `user_id` (multi-user); UUID primary keys; JSONB for metadata.

## Self-host deploy path

- Prod host: Hetzner box (`167.233.22.31`), app at `/opt/fleetcrown/app`,
  self-hosted Postgres (`fleetcrown` DB).
- CI-gated: `.github/workflows/deploy.yml` fires **after a green CI on `main`**
  (dormant until repo var `DEPLOY_VIA_CI=true` + `HETZNER_SSH_KEY` secret), then
  runs `scripts/deploy-hetzner.sh --no-build`.
- `deploy-hetzner.sh` applies schema **before** shipping code via
  `scripts/hetzner/apply-schema.sh` — forward-only, ledger-based
  (`public._deploy_schema_history`), **refuses destructive statements**, single
  transaction. A post-apply schema-drift gate **rolls back** on missing objects.
- Never commit secrets. Never point `DATABASE_URL` at the box for `push`.
- A laptop `.env` naming `neon.tech` or a Vercel token is leftover debris, not
  production. Env SSOT is `/opt/<app>/shared/.env` on bitbaum. See
  `docs/infrastructure/hetzner-migration.md`.
