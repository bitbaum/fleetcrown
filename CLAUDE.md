# Cockpit — Life Operating System

@~/.claude/CLAUDE.md

## What This Is

Cockpit is a multi-user SaaS platform for commanding AI agent fleets across projects. Users sign in (GitHub OAuth), register their projects, and launch/monitor AI agents from a single dashboard. Dark-first, mobile-ready, designed for builders who want control without complexity.

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

### Styling — Three layers, each with a strict purpose

```
globals.css @layer components   → SSOT for all recurring visual patterns (ui-* classes)
Tailwind utilities              → layout, spacing, sizing only — never colors
shadcn/ui                       → complex interactive JS components only (Dialog, Dropdown, etc.)
```

**Hard rules — violation = rewrite:**
- **Never** hardcode colors inline (`text-gray-400`, `bg-indigo-500`, `#fff`) — always use semantic tokens
- **Never** re-implement a pattern that has a `ui-*` class — use it
- **Never** reach for shadcn primitives (Card, Button, Input) — use `ui-panel`, `ui-btn-primary`, `ui-input`
- **`ui-*` classes are the SSOT** for buttons, panels, inputs, kickers, stat cards, nav items
- **Tailwind** for layout only: `flex`, `grid`, `gap-*`, `px-*`, `py-*`, `w-*`, `h-*`, `min-h-*`, `max-w-*`

**Design tokens (all in `globals.css`):**
- Surfaces: `bg-surface-page` → `bg-surface-base` → `bg-surface-raised` → `bg-surface-overlay`
- Text: `text-text-primary` → `text-text-secondary` → `text-text-tertiary` → `text-text-muted`
- Borders: `border-border-subtle` → `border-border-default` → `border-border-strong`
- Accent: `bg-accent-primary`, `text-accent-text`, `bg-accent-muted`

**Component classes (use these, don't reinvent):**
- Panels: `.ui-panel`, `.ui-panel-raised`
- Buttons: `.ui-btn-primary` (white bg), `.ui-btn-secondary` (outline), `.ui-btn-ghost`
- Input: `.ui-input`
- Labels: `.ui-kicker`
- Stats: `.ui-stat-grid`, `.ui-stat-card`, `.ui-stat-label`, `.ui-stat-value`
- Layout: `.app-page` (page wrapper), `.ui-page-title`, `.ui-page-subtitle`

### SSOT Rules
- **User ID**: `getCurrentUserId()` from `lib/session.ts` in API routes; `DEFAULT_USER_ID` is fallback only
- **Username normalization**: `normalizeUsername()` from `lib/username.ts` — used in forms, API, DB queries
- **Page layout**: `.app-page` class on root div — never repeat padding pattern
- **Navigation**: `config/navigation.ts` is SSOT for sidebar items
- **Modals/Drawers**: Use `<Modal>` / `<Drawer>` from `components/ui/modal.tsx` — never re-roll the `fixed inset-0 z-50 + backdrop + Esc handler` boilerplate
- **Date helpers**: `lib/dates.ts` exports `toLocalDateStr` (YYYY-MM-DD in local time) and `deadlineLabel`
- **Inline-edit lifecycle**: `useInlineEdit` from `hooks/use-inline-edit.ts`
- **Create flow**: `useCreateMutation` from `hooks/use-create-mutation.ts`

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
