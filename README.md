# Cockpit

Cockpit is a multi-user dashboard for running AI agent fleets across
projects, with life-OS views layered into the same interface. Users
sign in with GitHub, register projects, launch and monitor agents,
and keep goals, people, habits, money, and events in one place.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript strict** — schema is SSOT for types via Drizzle's
  `$inferSelect` / `$inferInsert`
- **Tailwind CSS 4 + shadcn/ui**
- **NextAuth v5 beta** with GitHub OAuth
- **Drizzle ORM** on **PostgreSQL 17**
- **zod** validation at API boundaries

## Views

| Route | What's there |
| ----- | ------------ |
| `/` | Landing page with sign-in entry |
| `/setup` | Bootstrap flow when no users exist yet |
| `/sign-in` | GitHub sign-in |
| `/today` | Calendar, weather, commitments, bills, daily habit check-off |
| `/control` | Agent fleet command center and orchestration status |
| `/projects` | Projects, repo health, sync actions, inline editing |
| `/goals` | Hierarchical goals, milestones, inline target/progress edit |
| `/people` | Contacts, search, detail panel, inline name/notes edit |
| `/habits` | 30-day heatmap per habit, streak indicator, summary stats |
| `/events` | Opportunities and deadlines, filter chips, archive flow |
| `/money` | Subscriptions and monthly burn |
| `/prompts` | Prompt library, run-now flow, scheduler |
| `/system` | Runtime health, uptime, autopilot jobs |
| `/thoughts` | Published essays on architecture and execution systems |
| `/settings` | Profile and team invite management |
| `/u/[username]` | Public user profile |
| `/invite/[token]` | Invitation acceptance flow |

## Architecture

```text
src/
├── app/             Pages, auth flows, and API routes
├── components/
│   ├── ui/          Shared primitives and layout helpers
│   ├── shell/       App shell, navigation, shared chrome
│   ├── control/     Agent fleet controls and project cards
│   └── <domain>/    today, people, projects, goals, money, habits, events,
│                    prompts, settings, system
├── config/          SSOT for navigation, channels, prompt library, subscriptions
├── db/
│   ├── schema/      Drizzle tables and inferred types
│   └── queries/     Data access functions by domain
├── hooks/           useFetch, useCreateMutation, useInlineEdit
└── lib/             constants, auth/session helpers, dates, tools, utils
```

## Setup

Set these required environment variables in `.env.local`:

```bash
DATABASE_URL=postgresql://cockpit:changeme@localhost:5432/cockpit
AUTH_SECRET=replace-me
GITHUB_CLIENT_ID=replace-me
GITHUB_CLIENT_SECRET=replace-me
```

**Local dev only** — never point `.env.local` at a cloud Postgres URL. Production uses
`DATABASE_URL` (direct) + `DATABASE_POOL_URL` (pooled) on Vercel. See
[`docs/infrastructure/postgres-portability.md`](docs/infrastructure/postgres-portability.md)
for switching hosts (Neon → Oracle/Hetzner) without code changes.

Postgres needs a local `cockpit` database (`docker compose up db -d`). Then push the schema:

```bash
DATABASE_URL=$YOUR_URL npx drizzle-kit push
```

On a fresh clone, visit `/setup` to create the first user. After that,
GitHub OAuth handles sign-in.

The seed script (`scripts/seed.ts`) reads from local personal data
sources under `~/.openclaw/*`. A fresh clone will not have those
files, so schema-only setup is the default path. To populate with real
data, either:

- Provide the `~/.openclaw/*` files yourself, then run
  `DATABASE_URL=$YOUR_URL npx tsx scripts/seed.ts`, or
- Add rows directly via the Cockpit UI against an empty database.

## Dev Commands

```bash
npm run dev          # Start the dev server on :3000
npm run build        # Production build (uses real DB connection)
npm run smoke        # Curl every page + DB-backed GET API and assert 2xx/3xx
npm run test:db-url  # Postgres URL resolution (portability)
npm run db:dump      # pg_dump backup (DATABASE_URL=direct)
npm run lint         # ESLint
```

A husky pre-commit hook runs `tsc --noEmit` and `eslint src/`
automatically. Smoke is opt-in (needs the dev server running) — run
before opening a PR. CI on push to `main` and every PR runs the same
type+lint checks; a daily Audit workflow surfaces new high-severity
CVEs in the dep graph.

## Working in the repo

`CLAUDE.md` at the project root is the contract for AI agents and the
rule book for non-obvious decisions: SSOT rules, naming conventions,
data-flow boundaries, security patterns. Read it before making
substantive changes.

For orchestration architecture and migration direction, also read:

- `docs/development/cloud-local-workflows.md` — what works in the browser vs on your machine
- `docs/architecture-first-principles.md`
- `docs/debt-reduction-roadmap.md`
- `docs/openclaw-orchestration-plan.md`
