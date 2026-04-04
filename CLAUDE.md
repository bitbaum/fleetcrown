# Cockpit — Life Operating System

@~/.claude/CLAUDE.md

## What This Is

Cockpit is George's private life OS powered by Ivy. A unified view of people, money, goals, projects, system health — everything that matters, in one place. Dark theme, mobile-first, built for one person but designed to be replicated for others.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript strict** — no `any` without justification
- **Tailwind CSS 4 + shadcn/ui** — always dark mode (`.dark` class on html)
- **Drizzle ORM** — schema is SSOT for types (`$inferSelect`, `$inferInsert`)
- **PostgreSQL 17** (self-hosted, `cockpit` database)

## Architecture

```
src/
├── app/           → Pages + API routes (thin, delegate to queries/components)
├── components/
│   ├── ui/        → Shared primitives (Card, CardHeader, StatCard, PageLayout)
│   ├── shell/     → AppShell, Sidebar, MobileNav, AskIvyButton
│   ├── today/     → CalendarCard, WeatherCard, CommitmentsCard, SubscriptionsCard
│   ├── people/    → PeopleGrid, PersonCard, PersonDetail
│   └── projects/  → GitHubStatus
├── config/        → SSOT for navigation, channels
├── db/
│   ├── schema/    → Drizzle tables (SSOT for all types)
│   └── queries/   → Data access functions (one file per domain)
├── hooks/         → Client hooks (useFetch)
└── lib/           → Constants, tools, utils
```

## Key Conventions

### SSOT Rules
- **User ID**: `DEFAULT_USER_ID` from `lib/constants.ts` — never hardcode the UUID
- **User name**: `DEFAULT_USER_NAME` from `lib/constants.ts`
- **Colors**: Use shadcn theme tokens (`bg-background`, `bg-sidebar`, `border-border`) — never hardcode hex
- **Card styling**: Always use `<Card>` from `components/ui/card.tsx` — never inline card classes
- **Page layout**: Use `<PageLayout>` for page headers — never repeat the h1/subtitle pattern
- **Channel config**: `config/channels.ts` is SSOT for channel icons/colors
- **Navigation**: `config/navigation.ts` is SSOT for sidebar items
- **Attribute fetching**: Use `fetchAttributesByEntityIds` from `db/queries/utils.ts` — never duplicate the batch-fetch-group pattern

### Data Flow
- **Server Components** for DB data (commitments, entities, subscriptions) — query directly
- **Client Components** for tool data (calendar, weather, GitHub) — fetch via API routes
- **API routes** shell out to Ivy's tools via `lib/tools.ts` for live data (gog, weather.sh, github-status.sh)

### Database
- Connection: `DATABASE_URL` env var (required, fail-fast if missing)
- Schema push: `DATABASE_URL=... npx drizzle-kit push`
- Seed: `DATABASE_URL=... npx tsx scripts/seed.ts`
- Every table has `user_id` for multi-user prep
- UUIDs for all primary keys
- JSONB for flexible metadata

### Security
- Escape LIKE wildcards in search queries (`escapeLike` in people.ts)
- Validate UUID format on API params before DB queries
- Validate/clamp input length and ranges at API boundary
- `runTool` in `lib/tools.ts` must never accept user-derived input

## Dev Commands

```bash
npm run dev          # Start dev server (default port 3000)
npm run build        # Production build
npx drizzle-kit push # Push schema changes to Postgres
npx tsx scripts/seed.ts  # Re-seed database from knowledge.sqlite + contacts
```

## Views

| View | Route | Status |
|------|-------|--------|
| Today | /today | Calendar, weather, commitments, bills |
| People | /people | 1,286 contacts, search, detail panel |
| Money | /money | Subscriptions, monthly burn |
| Goals | /goals | Hierarchical tree, progress, milestones |
| Projects | /projects | 15 projects + GitHub CI |
| System | /system | Gateway, memory, disk, uptime |
| Memory | /memory | Knowledge graph stats |
