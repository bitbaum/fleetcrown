# FleetCrown — Life Operating System

@~/.claude/CLAUDE.md

## Mission

FleetCrown is a personal life OS and AI agent fleet for builders running multiple projects simultaneously. FleetCrown itself is the customer of sibling product OrangeCat (economic layer / transaction half). Both OrangeCat and FleetCrown appear as projects/profiles on orangecat.ch under Mao Nakamoto. Shared BTC wallet, typed "customer" stakeholder relation. See live data + integration in marketing-content.ts and stakeholder_relationships.

## What This Is

FleetCrown is a multi-user SaaS platform for commanding AI agent fleets across projects. Users sign in (GitHub OAuth), register their projects, and launch/monitor AI agents from a single dashboard. Dark-first, mobile-ready, designed for builders who want control without complexity.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript strict** — no `any` without justification
- **Tailwind CSS 4 + shadcn/ui** — always dark mode (`.dark` class on html)
- **Drizzle ORM** — schema is SSOT for types (`$inferSelect`, `$inferInsert`)
- **PostgreSQL 17** (self-hosted, `fleetcrown` database)

## Architecture

```
src/
├── app/           → Pages + API routes (thin, delegate to queries/components)
├── components/
│   ├── ui/        → Shared primitives (Card, Modal, Drawer, Field, PageLayout)
│   ├── shell/     → AppShell, Sidebar, MobileNav (Today/Control/Projects + Loki + More), AskLokiButton → /loki
│   ├── control/   → ControlPanel, ProjectCard, ProjectTile, ProjectProfile (fleet command)
│   ├── agents/    → AgentsCockpit (roster + inter-agent comms feed, parses ~/.claude/cross-project/inbox-*.md)
│   ├── duet/      → DuetView, DuetPane (watch two agents' last prompts side by side, live off one bridge SSE)
│   ├── today/     → CalendarCard, WeatherCard, CommitmentsCard, SubscriptionsCard, HabitsList
│   ├── people/    → PeopleGrid, PersonCard, PersonDetail
│   ├── projects/  → ProjectGrid, ProjectDetail (split into header/tabs/inline-editors)
│   ├── goals/     → GoalCard, GoalsGrid, NewGoalButton
│   ├── money/     → SubscriptionActions, NewSubscriptionButton
│   ├── habits/    → HabitHeatmap (per-row daily check-off lives in today/)
│   ├── events/    → EventCard, AddEventForm, EventsGrid
│   ├── prompts/   → PromptRow, FeaturedCard, CategoryBar, RunModal, ScheduleModal
│   ├── settings/  → TeamSettings (invite flow)
│   └── system/    → AutopilotCard, JobDetail, SystemStats
├── config/        → SSOT for navigation, channels, prompt-library, subscriptions
├── db/
│   ├── schema/    → Drizzle tables (SSOT for all types)
│   └── queries/   → Data access functions (one file per domain)
├── hooks/         → useFetch, useCreateMutation, useInlineEdit
└── lib/           → constants, dates, tools, utils, api/* wrappers

home/              → Local-first agent orchestration library — runs on the
                     user's machine (not the hosted box). Pure pieces that tail one
                     append-only JSONL event log: watcher.ts (Bridge — emits
                     worker.idle when ~/.claude/sessions/*.md changes),
                     worker.ts (Consumer — injects bridge.dispatch into zellij,
                     sends Ctrl+C on bridge.cancel), plus decide/render/state.
                     The standalone Brain (home/server.ts, port 3001) and its
                     scripts/home-start.sh launcher were RETIRED in a3f470d:
                     Fleet Runner desktop is now the sole local executor and
                     embeds these pieces via startWatcher(). Every dispatch goes
                     cloud /api/inject → pending_command → Fleet Runner polls and
                     types into zellij. To iterate on a single piece, run it
                     directly (`npx tsx home/worker.ts --start`); test the whole
                     library with `npm run test:home` (inline tests, no
                     framework, also runs on pre-push). Full docs: home/README.md.
```

## Key Conventions

### Design System — The Four-Layer Architecture

Every pixel in FleetCrown flows through exactly four layers in order. Any shortcut past a layer is a violation.

```
Layer 1  globals.css :root / .dark     → Raw values: OKLCH colors, rem sizes, shadows
Layer 2  globals.css @theme inline     → Tailwind mappings: --color-* pointing to Layer 1 vars
Layer 3  globals.css @layer components → ui-* classes: every recurring visual pattern
Layer 4  JSX in components/            → Uses Layer 3 classes + layout-only Tailwind
```

**The rule in one sentence:** components describe structure and layout; globals.css owns every visual decision.

#### Layer 1 — CSS Custom Properties (the raw values)

All raw values live in `:root` / `.dark` in `globals.css`. Never define a visual value anywhere else.

```
Surfaces:  --surface-page → --surface-base → --surface-raised → --surface-overlay
Text:      --text-primary → --text-secondary → --text-tertiary → --text-muted
Borders:   --border-subtle → --border-default → --border-strong → --border-interactive
Accent:    --accent-primary, --accent-hover, --accent-muted, --accent-text
Status:    --status-positive / -warning / -negative / -neutral (+ -subtle variants)
Type:      --text-micro (10px), --text-nano (8px), --tracking-*, --font-*
Shadows:   --shadow-panel, --shadow-panel-strong
Spacing:   --modal-max-height (85vh), --page-min-height (60vh)
```

Dark mode is handled automatically — tokens flip under `.dark`. Components never hardcode light/dark variants.

#### Layer 2 — Tailwind Theme Mapping

`@theme inline` in `globals.css` maps Tailwind utilities to the Layer 1 vars. This means Tailwind class names like `bg-surface-raised`, `text-text-primary`, `shadow-panel-strong`, `text-micro` all resolve through CSS vars — one retheme = one file change.

**Never** put literal hex or RGB values in `@theme inline`. Only `var(--*)` references.

#### Layer 3 — The `ui-*` Class System (SSOT for patterns)

Every recurring visual pattern is a named `ui-*` class in `@layer components`. This is where all styling decisions are encoded.

```
Panels:    ui-panel, ui-card-shell, ui-card-shell-raised, ui-settings-section
Buttons:   ui-btn-primary, ui-btn-secondary, ui-btn-ghost, ui-btn-chip,
           ui-btn-icon, ui-btn-xs, ui-btn-save, ui-btn-submit, ui-btn-lg,
           ui-btn-ready-primary, ui-btn-ready-action, ui-btn-ready-more,
           ui-btn-confirm, ui-btn-danger, ui-btn-overlay
Inputs:    ui-input, ui-input-compact, ui-input-tight, ui-input-inline
Text:      ui-kicker, ui-micro-label, ui-page-title, ui-page-subtitle, ui-error
Chips:     ui-chip-filter, ui-chip-toggle, ui-badge, ui-tag (+ variants)
Status:    ui-dot-positive/-warning/-negative, ui-tag-positive/-warning/-negative
Layout:    app-page, ui-page-header, ui-empty-page (error/empty/placeholder pages)
Control:   ui-control-hero, ui-control-card-header-meta, ui-control-metric-*
Auth:      ui-auth-card, ui-auth-input, ui-auth-submit-btn, ui-auth-label (etc.)
Public:    ui-public-surface, ui-public-nav, ui-public-title, ui-public-badge (etc.)
Brand:     ui-channel-whatsapp/-telegram/-phone/-in-person (contact channel icons)
           ui-lang-ts/-js/-py/-go/-rs/-rb/-cs/-java (programming language badges)
           ui-cat-fleet/-security/-engineering/-frontend/... (prompt categories)
```

When a pattern appears in 3+ components: extract it to `@layer components` immediately.

**The public and auth surfaces** (`ui-public-*`, `ui-auth-*`) intentionally use `text-white/[opacity]` and `bg-white/[opacity]` inside their class definitions — those surfaces are always dark (near-black bg). This is correct and centralized. Components should use the class name, not the opacity utilities directly.

#### Layer 4 — JSX (structure and layout only)

In component JSX, only two things are allowed:
1. **`ui-*` class names** (semantic, from Layer 3)
2. **Tailwind layout utilities** — `flex`, `grid`, `gap-*`, `px-*`, `py-*`, `w-*`, `h-*`, `max-w-*`, `min-h-*`, `items-*`, `justify-*`, `col-span-*`, `overflow-*`, `rounded-*` (using the token-mapped values), `text-*` sizing only (not color)

**Absolutely never in JSX:**
```
❌  text-gray-400       ← palette color (use text-text-secondary etc.)
❌  bg-indigo-500       ← palette color
❌  bg-[#1a2b3c]        ← hex value
❌  text-[10px]         ← arbitrary size (use text-micro)
❌  text-[8px]          ← arbitrary size (use text-nano)
❌  shadow-[var(--*)]   ← use shadow-panel / shadow-panel-strong
❌  min-h-[44px]        ← use min-h-11 (44px on spacing scale)
❌  h-[72px]            ← use h-18 (72px on spacing scale)
❌  min-h-[60vh]        ← use ui-empty-page class
```

#### The Decision Tree

Adding any visual element — ask in order:

1. **Does a `ui-*` class already exist for this?** → Use it.
2. **Is this a new recurring pattern (will appear 3+ times)?** → Add a `ui-*` class to `globals.css @layer components`.
3. **Is this a new color?** → Add a CSS custom property to `:root`/`.dark` in `globals.css`, map it in `@theme inline`, then use it via a new `ui-*` class or a semantic Tailwind class.
4. **Is this a layout value?** → Check the Tailwind spacing scale first (multiples of 4px: `h-18`=72px, `min-h-11`=44px). Use a CSS var + token if it's repeated (`--modal-max-height`, `--page-min-height`).
5. **Is this a one-off layout constraint with no semantic meaning?** → Arbitrary value `[value]` is acceptable only here, and only for layout (widths, heights, max-widths) — never for colors or typography.

#### Audit command

```bash
# Find all violations instantly:
grep -rn "text-gray-\|text-slate-\|text-zinc-\|text-blue-\|text-green-\|text-red-\|text-purple-\|text-yellow-\|text-orange-\|text-cyan-\|text-violet-\|bg-gray-\|bg-blue-\|bg-green-\|bg-red-\|bg-\[#\|text-\[#\|text-\[1[0-9]px\]\|text-\[8px\]" src/components/ src/app/ --include="*.tsx" --include="*.ts"
# Zero output = compliant.
```

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
- **API routes** shell out to local CLI tools via `lib/tools.ts` for live data (gog, weather.sh, github-status.sh) when `isRuntimeAvailable()`

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

## Cloud vs local

See `docs/development/cloud-local-workflows.md` — SSOT for which workflows run in the browser vs require the local daemon (hosted agent installer, Zellij, agent CLIs).

See `docs/development/responsive-design.md` — SSOT for mobile chrome tokens, shell layout, viewport-height panes, and responsive component patterns. All pages must work at 320px+ without horizontal scroll.

## Dev Commands

```bash
npm run dev          # Start dev server (default port 3000)
npm run build        # Production build
npm run smoke        # Curl every page route on localhost:3000 and assert 2xx/3xx
npm run test:home    # Run all eight home/ inline self-test suites (~14s)
npx drizzle-kit push # Push schema changes to Postgres
npx tsx scripts/seed.ts  # Re-seed database from knowledge.sqlite + contacts
npx tsx home/worker.ts --start  # Run a single home/ piece for iteration
                                # (Fleet Runner desktop is the real executor)
```

A husky pre-commit hook runs `tsc --noEmit` and `eslint src/` automatically.
A husky pre-push hook runs `npm run test:home` (always) and `npm run smoke`
(if the dev server is up) before pushing. When `SMOKE_PRIVATE_PIN` is in
`.env.local` (or exported), `npm run test:pre-push-prod-dogfood` runs authenticated prod smoke and headless
prod UI dogfood (`ui-flows` always; `dogfood:loki` when builder online; `dogfood:machine` when local Fleet Runner connected).
Smoke is opt-in (needs the dev server running) — run before opening a PR.

## Views

| View | Route | Status |
|------|-------|--------|
| Control | /control | Fleet command center: dispatch intents to AI agents, real-time SSE status, per-project cards, git sync guard |
| Agents | /agents | Fleet roster (open tabs + presence/active dots) beside a live inter-agent comms feed parsed from ~/.claude/cross-project/inbox-*.md; message-type badges (task/result/question/escalation) |
| Duet | /duet | Watch two agents side by side — each pane shows a project's last dispatched prompt, updating live off one bridge SSE connection |
| Today | /today | Calendar, weather, commitments, bills, daily habit check-off, log conversation |
| People | /people | 1,286 contacts, search, detail panel, inline name/notes edit |
| Money | /money | Subscriptions, monthly burn |
| Goals | /goals | Hierarchical tree, progress, milestones, inline target-date / progress edit |
| Projects | /projects | 15 projects + GitHub CI, inline editors for name/desc/status/maturity; per-project dossier + shareable public link (/share/project/[token], audience-scoped resource visibility) |
| Habits | /habits | 30-day heatmap per habit, streak indicator, summary stats |
| Events | /events | Opportunities and deadlines, type-chip filter, archive flow |
| Prompts | /prompts | Prompt library, run-now via Loki, schedule as cron job |
| System | /system | Gateway, memory, disk, uptime, autopilot jobs |
| Memory | /memory | Knowledge graph stats and recent activity |
| Thoughts | /thoughts | Published essays on architecture and execution systems |
| Settings | /settings | Profile + team invite management |
