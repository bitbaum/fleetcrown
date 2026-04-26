# Cockpit

George's private life OS, powered by Ivy. A unified dark-themed
mobile-first dashboard for people, money, goals, projects, habits,
events, and system health. Built for one person but designed to be
replicated for others.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript strict** — schema is SSOT for types via Drizzle's
  `$inferSelect` / `$inferInsert`
- **Tailwind CSS 4 + shadcn/ui** — always dark mode
- **Drizzle ORM** on **PostgreSQL 17** (self-hosted, `cockpit` database)
- **zod** validation at every API boundary

## Views

| Route       | What's there                                                          |
| ----------- | --------------------------------------------------------------------- |
| `/today`    | Calendar, weather, commitments, bills, daily habit check-off          |
| `/people`   | 1,286 contacts, search, detail panel, inline name/notes edit          |
| `/money`    | Subscriptions, monthly burn                                           |
| `/goals`    | Hierarchical tree, progress, milestones, inline target/progress edit  |
| `/projects` | Projects + GitHub CI, inline editors for name/desc/status/maturity    |
| `/habits`   | 30-day heatmap per habit, streak indicator, summary stats             |
| `/events`   | Opportunities and deadlines, type-chip filter, archive flow           |
| `/prompts`  | Prompt library, run-now via Ivy, schedule as cron job                 |
| `/system`   | Gateway, memory, disk, uptime, autopilot jobs                         |
| `/memory`   | Knowledge-graph stats and recent activity                             |

## Architecture

```
src/
├── app/             Pages + API routes (thin, delegate to queries/components)
├── components/
│   ├── ui/          Shared primitives (Card, Modal, Drawer, Field, EmptyState, …)
│   ├── shell/       AppShell, Sidebar, MobileNav, AskIvyModal
│   └── <domain>/    today, people, projects, goals, money, habits, events,
│                    prompts, system — one folder per view
├── config/          SSOT for navigation, channels, prompt-library, subscriptions
├── db/
│   ├── schema/      Drizzle tables (SSOT for all types)
│   └── queries/     Data access functions, one file per domain
├── hooks/           useFetch, useCreateMutation, useInlineEdit
└── lib/             constants, dates, tools, utils, api/* wrappers
```

## Setup

Postgres has to be running locally with the `cockpit` database
created. Set `DATABASE_URL` in `.env.local`:

```bash
echo 'DATABASE_URL=postgresql://localhost/cockpit' >> .env.local
```

Push the schema:

```bash
DATABASE_URL=$YOUR_URL npx drizzle-kit push
```

The seed script (`scripts/seed.ts`) reads from George's personal
knowledge graph at `~/.openclaw/knowledge.sqlite` and contacts at
`~/.openclaw/workspace/data/contact-resolver.json`. **A fresh clone
will not have those files** — the schema-only setup gives you an
empty database that the UI handles gracefully (every page has an
empty state). To populate with real data, either:

- Provide the two `~/.openclaw/*` files yourself, then run
  `DATABASE_URL=$YOUR_URL npx tsx scripts/seed.ts`, or
- Add rows directly via the Cockpit UI (every "New X" button works
  against an empty database).

## Dev Commands

```bash
npm run dev          # Start the dev server on :3000
npm run build        # Production build (uses real DB connection)
npm run smoke        # Curl every page + DB-backed GET API and assert 2xx/3xx
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
