# Responsive Design — FleetCrown Web App

**Created:** 2026-06-27  
**Last modified:** 2026-08-18  
**Last modified summary:** Loki start screen docks the composer to the thumb zone; /terminal chrome collapses to one mobile bar; xterm auto-fits its font to 80 columns instead of tearing 80-column output into a 44-column grid.

FleetCrown is **mobile-first and dark-first**. Every authenticated route must be usable on a 320px-wide phone without horizontal page scroll, with primary actions reachable above the floating bottom nav.

## Breakpoints

Tailwind defaults (via `@theme inline` in `globals.css`):

| Token | Width | Shell behaviour |
| --- | --- | --- |
| (default) | `<640px` | Bottom nav pill, compact page headers, stacked layouts |
| `sm` | `≥640px` | Chip rows may wrap; some subtitles appear |
| `md` | `≥768px` | Sidebar visible; desktop top-bar search; duplicate page titles allowed |
| `lg` | `≥1024px` | Control workspace two-column rail + detail |

## Mobile chrome (Layer 1 tokens)

Defined in `src/app/globals.css` `:root`:

```
--mobile-nav-height       Bottom tab bar height
--mobile-nav-offset       Float gap above screen edge
--mobile-safe-bottom      env(safe-area-inset-bottom)
--mobile-chrome-bottom    Total bottom inset (nav + offset + safe area)
--app-topbar-height       Sticky AppTopBar height
--app-viewport-height     100svh − top bar − mobile chrome (phones)
```

**Rule:** full-height surfaces (Loki, Terminal, workspace terminal) use `.app-viewport-pane`, not ad-hoc `100vh` / `100dvh` math.

## Shell layout

```
.app-shell-frame          overflow-x-clip — no page-level horizontal bleed
.app-main                 padding-bottom: mobile chrome + 1rem
.app-page                 Standard page gutter (px-4 … md:px-8)
.app-page-compact         Tighter vertical padding for chat/terminal pages
.app-viewport-pane        Full remaining viewport height
```

Navigation:

- **Desktop (`md+`)**: `Sidebar` + full `AppTopBar` search + theme cycle in top bar and sidebar footer
- **Mobile**: `AppTopBar` page label + icon search + theme cycle; bottom bar is **Today · Control · Loki · Menu**; the Menu sheet mirrors sidebar sections (Work / Private / Site) with Settings, appearance, and sign-out in the footer

## Component patterns

| Pattern | Class / component | Mobile note |
| --- | --- | --- |
| Page title | `PageTitle` | Hides when it duplicates `AppTopBar` label |
| Modals | `Modal` | Bottom-anchored on phones; `--mobile-chrome-bottom` inset |
| Drawers | `Drawer` + `ui-drawer-body` | Full width; safe-area padding on scroll body |
| Loki composer | `ui-loki-composer` | Stacks textarea + toolbar row on `<sm` |
| Control project rail | `ui-control-project-list` | Vertical list on phones; horizontal scroll removed |
| Horizontal filters | `overflow-x-auto ui-scroll-fade-right` | Today, Projects, Events, Prompts chip rows |
| Touch targets | `min-h-11 sm:min-h-0` on icon actions | WCAG 2.5.5 on phones |
| Theme | `ThemeToggle` cycle button (`ui-theme-cycle-btn`) | One control cycles Light → Dark → Auto; select variant in Settings |

## Public / auth surfaces

Always-dark subtree (`PublicSurface` + `ui-public-*` classes):

- Hero fold uses shorter `min-height` on narrow viewports
- Hero lede scales `text-lg` → `sm:text-2xl`
- Header brand row: `ui-public-nav-brand-row` (`gap-3 sm:gap-8`)
- Signed-out CTA: compact "Get started" visible on all widths

## Audit commands

```bash
# Design-system colour/size violations in JSX
grep -rn "text-gray-\|bg-\[#\|text-\[1[0-9]px\]" src/components/ src/app/ --include="*.tsx"

# Ad-hoc viewport heights (should use app-viewport-pane instead)
grep -rn "100dvh\|100vh\|100svh" src/app src/components --include="*.tsx"

# Fixed min-widths that may overflow phones
grep -rn "min-w-\[" src/components src/app --include="*.tsx"
```

## Testing checklist

Before shipping UI changes, verify at **375×667** and **320×568**:

1. `/today`, `/control`, `/projects` — no horizontal scroll; bottom nav never covers primary CTAs
2. `/loki` — composer docked at the bottom on the start screen; Send visible; history/filter drawers full width
3. `/terminal` — mobile bar is two rows; xterm fills the rest; column readout reports ≥60
4. Modals (bootstrap project, run prompt) — actions above bottom nav
5. `/people` detail drawer — scroll + safe area
6. Landing `/` — hero readable; public nav drawer opens

Run `npm run smoke` with dev server up for route health; Playwright viewport tests are planned but not yet in CI.

## Terminal page (`/terminal`)

**One mobile bar, not five stacked blocks.** The desktop chrome — source segment, tab strip, session bar with its agent chip, input segment and hint paragraph — measured 331px on a 390×844 phone, above a terminal that got four visible lines. Below `md` all of it is hidden and `TerminalMobileBar` renders instead: two rows of `<select>` (source · session, then agent · input mode) plus the full-screen toggle. Segmented chip rows are a desktop idiom; a phone's one-of-N control is the native picker.

**Expand** (`TerminalMobileShell`) switches to `.ui-term-mobile-fullscreen`: fixed `100svh`, hides mobile nav and top bar, body class `fc-terminal-fullscreen` locks scroll. The toggle lives in the mobile bar — the shell no longer renders a header row explaining that the pane is too small.

**Column fidelity beats font size.** xterm's grid must match the width the agent drew for, or absolute cursor moves land in the wrong cell and text arrives torn mid-word. At a fixed 13px a 390px phone measured ~44 columns against `TERMINAL_TARGET_COLS` (80), so `TerminalView` now auto-fits the font down (floor 7px) until 80 columns fit, and offers an A−/A+ stepper (persisted in `fleetcrown:terminal-font-size`) plus a live column readout that turns warning-toned below target.

**A narrow viewer never reshapes the session.** `TERMINAL_MIN_COLS` is 60 (was 40): under that, `ptyResizeToPublish` stays silent rather than publishing a phone-sized geometry that the runner would apply to the live tab.

**A deep link that misses attaches to nothing.** `resolveTabAttachment` returns `activeTab: null` when `?tab=` names a session this builder does not have; `TerminalSessionMiss` fills the terminal's slot with the alternatives. The previous fall-through to `tabs[0]` aimed keystrokes at an unrelated agent under a bar promising they went "straight to the session".

Deep link after Loki dispatch: `/terminal?source=machine&tab=<projectKey>`.

## Overlays

**Overlays (drawers/modals):** opening any `Drawer` or `Modal` sets `body.fc-overlay-open` — hides bottom nav and top bar so full-screen project profiles and Loki slide-overs are not obscured. Audit: `node scripts/mobile-pages-audit.mjs`.

## Loki page (`/loki`)

The start screen docks the composer to the **bottom** on phones (`.ui-loki-stage-empty` is `justify-end`, `sm:justify-center`) — centring put the page's only control in the middle of ~1000px of empty grey, out of thumb reach. `LokiStartPanel` spends that space on the recent threads, one tap from resuming.

Composer chips are start-screen openers: `showStarters` is false once a conversation has messages, so they stop taking a third of the transcript to re-offer a decision already made. The scope row renders only when it has content instead of reserving a `min-h-7` strip for nothing.

The needs-project picker (`.ui-loki-picker`) is a two-column grid with a filter past eight projects and a "Just answer" escape — a question that arrived without a project is still a question.

## Projects page layout

`/projects` uses a **sticky search + filter bar** (`ui-projects-sticky-bar`), one **attention card** per flagged project, then a **compact list** (`ui-projects-row`) capped at 25 rows with “Show all”. Freeform status values never render as filter chips — only lifecycle badges via `shortProjectStatus()` in `lib/projects-display.ts`. Duplicate entity names collapse server-side via `mergeDuplicateProjectRows()`.
