# Cockpit — Life Operating System

@~/.claude/CLAUDE.md

## What This Is

Cockpit is George's private life OS powered by Ivy. A unified view of people, money, goals, projects, habits, events, system health — everything that matters, in one place. Dark theme, mobile-first, built for one person but designed to be replicated for others.

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
│   ├── ui/        → Shared primitives (Card, Modal, Drawer, Field, PageLayout)
│   ├── shell/     → AppShell, Sidebar, MobileNav, AskIvyModal
│   ├── today/     → CalendarCard, WeatherCard, CommitmentsCard, SubscriptionsCard, HabitsList
│   ├── people/    → PeopleGrid, PersonCard, PersonDetail
│   ├── projects/  → ProjectGrid, ProjectDetail (split into header/tabs/inline-editors)
│   ├── goals/     → GoalCard, GoalsGrid, NewGoalButton
│   ├── money/     → SubscriptionActions, NewSubscriptionButton
│   ├── habits/    → HabitHeatmap (per-row daily check-off lives in today/)
│   ├── events/    → EventCard, AddEventForm, EventsGrid
│   ├── prompts/   → PromptRow, FeaturedCard, CategoryBar, RunModal, ScheduleModal
│   └── system/    → AutopilotCard, JobDetail, SystemStats
├── config/        → SSOT for navigation, channels, prompt-library, subscriptions
├── db/
│   ├── schema/    → Drizzle tables (SSOT for all types)
│   └── queries/   → Data access functions (one file per domain)
├── hooks/         → useFetch, useCreateMutation, useInlineEdit
└── lib/           → constants, dates, tools, utils, api/* wrappers
```

## Key Conventions

### SSOT Rules
- **User ID**: `DEFAULT_USER_ID` from `lib/constants.ts` — never hardcode the UUID
- **User name**: `DEFAULT_USER_NAME` from `lib/constants.ts`
- **Colors**: Use shadcn theme tokens (`bg-background`, `bg-sidebar`, `border-border`) and the project surface tokens (`bg-surface-modal`, `bg-surface-drawer`) — never hardcode hex
- **Card styling**: Always use `<Card>` from `components/ui/card.tsx` — never inline card classes
- **Modals/Drawers**: Use `<Modal>` / `<Drawer>` from `components/ui/modal.tsx` — never re-roll the `fixed inset-0 z-50 + backdrop + Esc handler` boilerplate
- **Form inputs**: Use `<Field>` + `FIELD_INPUT_CLASS` (modal forms) or `FIELD_INPUT_CLASS_COMPACT` (inline-edit) from `components/ui/form.tsx`
- **Page layout**: Use `<PageLayout>` for page headers — never repeat the h1/subtitle pattern
- **Channel config**: `config/channels.ts` is SSOT for channel icons/colors
- **Navigation**: `config/navigation.ts` is SSOT for sidebar items
- **Habit window**: `HABIT_HISTORY_DAYS` from `lib/constants.ts` — single source for the heatmap span and the queries' default window
- **Attribute fetching**: Use `fetchAttributesByEntityIds` from `db/queries/utils.ts` — never duplicate the batch-fetch-group pattern
- **Inline-edit lifecycle**: `useInlineEdit` from `hooks/use-inline-edit.ts` owns editing/draft/saving for click-to-edit toggles
- **Create flow**: `useCreateMutation` from `hooks/use-create-mutation.ts` owns POST → decode `{ok,error}` → router.refresh
- **Date helpers**: `lib/dates.ts` exports `toLocalDateStr` (YYYY-MM-DD in local time) and `deadlineLabel` (Overdue/Due X phrasing)

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
npm run smoke        # Curl every page route on localhost:3000 and assert 2xx/3xx
npx drizzle-kit push # Push schema changes to Postgres
npx tsx scripts/seed.ts  # Re-seed database from knowledge.sqlite + contacts
```

A husky pre-commit hook runs `tsc --noEmit` and `eslint src/` automatically.
Smoke is opt-in (needs the dev server running) — run before opening a PR.

## Views

| View | Route | Status |
|------|-------|--------|
| Today | /today | Calendar, weather, commitments, bills, daily habit check-off, log conversation |
| People | /people | 1,286 contacts, search, detail panel, inline name/notes edit |
| Money | /money | Subscriptions, monthly burn |
| Goals | /goals | Hierarchical tree, progress, milestones, inline target-date / progress edit |
| Projects | /projects | 15 projects + GitHub CI, inline editors for name/desc/status/maturity |
| Habits | /habits | 30-day heatmap per habit, streak indicator, summary stats |
| Events | /events | Opportunities and deadlines, type-chip filter, archive flow |
| Prompts | /prompts | Prompt library, run-now via Ivy, schedule as cron job |
| System | /system | Gateway, memory, disk, uptime, autopilot jobs |
| Memory | /memory | Knowledge graph stats and recent activity |
