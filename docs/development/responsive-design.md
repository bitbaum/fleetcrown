# Responsive Design — FleetCrown Web App

**Created:** 2026-06-27  
**Last modified:** 2026-08-20  
**Last modified summary:** PublicSurface no longer always-dark; theme toggle on public nav (THEME_OPTIONS SSOT).

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

Authenticated pages should still enter through `PageLayout` (see
`docs/branding-design.md` → App-shell layout SSOT). Mixing raw `app-page max-w-*`
with bespoke wrappers is the main source of inconsistent positioning across
routes.

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

`PublicSurface` + `ui-public-*` follow the same `THEME_OPTIONS` (Light / Dark / Auto) as the app shell — do not pin `.dark` on the public subtree. Theme cycle lives in `PublicHeaderActions`.

- Hero fold uses shorter `min-height` on narrow viewports
- Hero lede scales `text-lg` → `sm:text-2xl`
- Header brand row: `ui-public-nav-brand-row` (`gap-3 sm:gap-8`)
- Signed-out CTA: compact "Get started" visible on all widths; theme toggle beside it

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
2. `/loki` — composer Send visible; history/filter drawers full width
3. `/terminal` — xterm fills pane; "My machine" tabs scroll horizontally above terminal
4. Modals (bootstrap project, run prompt) — actions above bottom nav
5. `/people` detail drawer — scroll + safe area
6. Landing `/` — hero readable; public nav drawer opens

Run `npm run smoke` with dev server up for route health; Playwright viewport tests are planned but not yet in CI.

## Control page (`/control`)

Control's failure mode was never one bad component — it was **twelve sibling
full-width sections with no hierarchy**, and layout logic that started at `sm:`
(640px), which is above every phone. A 390px device therefore never got a
designed layout; it got the fallback (`flex-col`, full width, nothing aligned to
anything). Both are fixed, and both are easy to undo by accident:

**Write phone rules as the base and relax them at `sm:`/`md:`.** A rule that
only exists at `sm:` and up does not exist on a phone. The hero (`ui-hero-*`) is
the reference: base rules describe 320px, `sm:` only spends the extra room.

**The hero answers one question.** *Is anything waiting on me?* — headline,
the projects by name, and at most ONE button. It previously carried five things
(runner line + versions, refresh, new project, autopilot pulse, Pause fleet, a
four-chip counter row, an explanatory paragraph) and its loudest control was
Pause fleet, which a builder uses roughly never. Counters and builder state live
in a quiet foot line; autopilot and refresh live in `ControlSettingsSheet`.

**Small tasks are one queue, not many strips.** `ControlInbox` holds feedback
triage and widget coverage together, collapsed, capped at three rows per group,
nothing auto-expanding. Adding a third "just one more strip" to the page is the
regression this replaced — add a group to the inbox instead.

**Row actions are never primaries.** A list of filled buttons has no primary
whatever its colour. Filled (`ui-btn-primary`) is for the action on a whole
group; rows get `ui-btn-secondary`. Use the size axis `ui-btn-sm` — never invent
a fifth filled variant with a size baked into it (that is how `ui-btn-save`,
`ui-btn-submit`, `ui-btn-lg` and `ui-btn-ready-primary` all came to exist).

**Nothing may rely on hover to be legible.** Phones have none. `OutcomeStreak`
was five glyphs whose meaning lived in a `title`; it now states its summary in
words. A `title` is an enhancement, never the only copy of a fact.

## Sheets (`ui-sheet-*`)

Shared bottom-sheet shell — used by the terminal's session setup and Control's
fleet settings. The rule that decides what belongs in one: **settings, not
state.** Controls chosen deliberately, changed rarely, and never read while work
is in flight. State stays on the page.

## Voice and pictures

Both dispatch composers (Control's `PromptInput`, `TerminalComposer`) take voice
(Whisper, already wired) and images/text files by picker or paste via
`useAttachments`. A screenshot with no text is a valid send — the picture is the
instruction.

A terminal agent cannot read pixels, so an image is never forwarded: it is
described by the vision preflight and folded into the prompt as TEXT, server
side, in `lib/composer-attachments` — called from `/api/inject`,
`/api/control/tab-inject` and `/api/orchestration/run`. Do not fold client-side:
a client that forgets sends a prompt referring to a screenshot nobody looked at,
and that failure is silent.

## Terminal page (`/terminal`)

Below `md` the terminal is three pieces and nothing else: a one-line header (`TerminalMobileHeader` — session name, live dot, full-screen toggle), the screen, and the dock (`TerminalMobileDock`). Everything that is *setup* rather than *state* — source, session list, agent, input mode, text size, live-keystrokes — lives in `TerminalSessionSheet`, one tap behind the session name. The desktop chrome (source bar, tab strip, session bar, status row) is `hidden md:block`; there is one `TerminalView` shared by both.

**The key deck is the point.** A soft keyboard has no arrows, no Esc, no Tab and no Ctrl — exactly the keys an agent TUI asks its questions with — so `TerminalKeyDeck` supplies them as buttons that write raw bytes through `transport.sendKey`. Sequences are SSOT in `config/terminal-keys.ts`; the deck is layout, hold-to-repeat and haptics. Arrows and Backspace auto-repeat when held; Enter and the control codes deliberately do not. Keys fire on `pointerdown` with `preventDefault()` so a tap never moves focus and dismisses the keyboard.

Typing goes through `TerminalRawComposer`, not the xterm canvas: a real `<textarea>` (with `autoCorrect="off"`) that sends the line on Send, appending `\r` unless the ⏎ chip is toggled off. `liveKeys` (session sheet) hands the keyboard back to xterm and defaults per device — off on a phone, on at desktop widths. `useKeyboardInset` pads the surface by the height `visualViewport` says the soft keyboard is covering, so the deck sits on the keyboard rather than behind it.

**Expand** (`TerminalMobileShell`) switches to `.ui-term-mobile-fullscreen`: fixed `100svh`, hides mobile nav and top bar, body class `fc-terminal-fullscreen` locks scroll — and there the keyboard inset is exact, since `.app-main`'s nav padding is zeroed. Deep link after Loki dispatch: `/terminal?source=machine&tab=<projectKey>`.

Verified at 320 and 390 CSS px: no horizontal overflow, every keycap ≥44px, and the terminal keeps ~496px of the 844px screen (it had ~150px before).

**Overlays (drawers/modals):** opening any `Drawer` or `Modal` sets `body.fc-overlay-open` — hides bottom nav and top bar so full-screen project profiles and Loki slide-overs are not obscured. Audit: `node scripts/mobile-pages-audit.mjs`.

## Projects page layout

`/projects` uses a **sticky search + filter bar** (`ui-projects-sticky-bar`), one **attention card** per flagged project, then a **compact list** (`ui-projects-row`) capped at 25 rows with “Show all”. Freeform status values never render as filter chips — only lifecycle badges via `shortProjectStatus()` in `lib/projects-display.ts`. Duplicate entity names collapse server-side via `mergeDuplicateProjectRows()`.
