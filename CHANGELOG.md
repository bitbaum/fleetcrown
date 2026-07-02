# Changelog

Notable, user-facing changes. Older history lives in the git log (conventional commits).

**Last modified:** 2026-07-02 — fleet truth pass: honest hero, actionable failure streaks, self-running janitors.

## 2026-07-02 (c)

### Fixed
- **Dispatched prompts no longer vanish into boot dialogs.** On a fresh clone the
  trust-folder dialog ate the injected paste (the Enter accepted the dialog), the
  output-activity check mistook boot redraw for generation, and six agents were acked
  "injected" while sitting idle at an empty composer. Dispatch now verifies against the
  CLI's own live session status (`~/.claude/sessions/<pid>.json` flips off "idle" when
  a prompt submits) and re-injects once when verifiably idle.
- **Dispatched prompts actually submit.** Big prompts (with context blocks) were still
  being ingested by the TUI when the fixed-delay Enters arrived — swallowed as in-paste
  newlines, prompt parked in the composer. Injection now wraps the body in explicit
  bracketed-paste markers (atomic ingestion; the following Enter is a real keypress),
  and the verify-retry first sends a bare Enter (submits a parked composer without
  duplicating it) before falling back to a full re-inject.
- **Box agents now read as Working.** The runtime pusher synthesizes the
  direct-terminal observation from the CLI's live status, so a headless PTY agent
  mid-task shows "Working" instead of "process detected, no lifecycle signal".
- **Cloud runtime state can no longer freeze on a laptop snapshot.** With no
  projects.conf (headless box) the pusher pushed zero project entries — project_states
  was only ever fed by the laptop runner, so the UI froze on a days-old "5 awaiting
  input" while real agents ran unseen. The pusher now derives projects from the agent
  processes actually running.
- **Deploys can't hang silently.** The restart ssh once hung 47 minutes after a
  successful restart, freezing the deploy before verification and the runner sync;
  it now runs under a hard timeout with keep-alives.
- **Runs close again: every queued dispatch now carries the handoff exit-contract.**
  The cloud dispatch path never told agents to write `~/.claude/sessions/<tab>.md`,
  so box agents finished real work, searched for the contract, found nothing — and
  their runs sat "waiting" until reaped as timeouts. The contract block is now SSOT
  (`sessionHandoffContract`) shared by the local enrichment path and
  `assembleInjectPrompt`, so run closure no longer depends on which machine executes
  or whose dotfiles it has.

## 2026-07-02 (b)

### Fixed
- **Autopilot scheduler saw zero users.** The nudge-idle cron only counted users with an
  explicit `beacon_settings` row, but a missing row means autopilot ON (the default) —
  so default-mode fleets were never nudged while the hero said "Autopilot on". One SSOT
  helper (`getFleetAutopilotUserIds`) now decides enrollment for schedulers and UI alike.
- **Stale runs are reaped on the clock, with truthful durations.** The run reaper only
  fired on Control page loads; dead runs lingered "waiting" for 51 hours until someone
  looked, then got stamped with fabricated 51-hour durations. Now an hourly cron reaps
  fleet-wide and `finished_at` reflects the actual timeout threshold (60 min).

### Changed
- **The Control hero tells the truth.** "Building" used to mean "the autopilot toggle is
  on" — it stayed green while zero agents worked and every recent run had failed. The
  headline now derives from reality: Building (agents active) / Waiting to dispatch /
  **Stalled** (latest runs failing, with a Review-failures link) / Paused.
- **Run-outcome streaks are clickable.** The ✓/✗ glyph row on each project card now
  deep-links to Activity filtered to that project — a failure signal leads to its cause
  instead of dead-ending.
- **Box-runner journal noise cut ~40k lines/day** — poller status logs on state change
  (plus a 15-min liveness heartbeat), not every 2-second poll.

## 2026-07-02 (a)

### Added
- **Login with OrangeCat** (identity bridge Part A) — OIDC sign-in against orangecat.ch;
  fixed the token exchange (OC requires `client_secret_post`). Existing users can link
  from Settings → Account → Connect OrangeCat.
- **Publish to OrangeCat + changelog→wall promote** (bridge Part C) — opt-in per project;
  devlog entries promote to the OC project wall with idempotent dedupe ids, backstopped
  by a daily reconcile cron so a dropped promote is never silently lost.

## 2026-06-29 (t)

### Added
- **Build / Pause selected** on Control project rail — bulk-select checkboxes kick or pause
  subsets via `fleet-kick` / `fleet-pause`.
- **Loki multi-dispatch** — multiple projects selected + a command fans out (concurrency cap 3).
- **Screenshot → dispatch** — scoped screenshot + implement/default ask routes to dispatch
  with vision preflight, not chat.

## 2026-06-29 (s)

### Added
- **Fleet kick.** Start building on Control (or "develop all my projects" in Loki) proactively
  dispatches `next_best` on eligible idle projects — capped at 3 concurrent; autopilot
  keeps loops going when agents finish.

### Fixed
- **nudge-idle cron** now targets users with autopilot on (`!= off`); the legacy `next_best`
  filter had made the scheduled idle nudge a no-op since the 2026-06-11 mode collapse.

## 2026-06-29 (r)

### Added
- **Loki business plan fast path.** "Generate/iterate business plan for `<project>`" runs
  `generateBusinessPlan` (same as Projects UI) and links to the Business section.
- **Loki profile update drafts.** "Set/update mission, stack, DoD, …" queues a Today action;
  approving applies the attribute (IRON RULE — no silent profile writes from chat).

## 2026-06-29 (q)

### Added
- **Project-aware Loki chat.** Select a project or name it in your message — chat turns
  inject the same profile + goals block as dispatch (`getProjectContext`), without
  sending work to the runner.

## 2026-06-29 (p)

### Added
- **Loki screenshot attachments.** Paste or pick PNG/JPEG/WebP/GIF; Groq vision preflight describes
  the image for chat and dispatch prompts (terminal agents get text, not raw pixels).
- **Composer quick chips** (Next best, Code review, Fix tests, Review UI) and scoped-project pill.

### Changed
- **Model picker** hidden on small screens (Auto default). **FAB hidden on `/loki`** (Loki tab is enough).

## 2026-06-27 (o)

### Changed
- **Single Loki surface.** Shell FAB and `?` shortcut navigate to `/loki` instead of a
  chat-only modal. `loki:open` prefills the composer (`?q=` or in-page event).
- **Fleet-aware Loki commands.** "List my projects" and "create project …" resolve from
  Postgres; ambiguous dispatches show tappable project chips in the transcript.

## 2026-06-28 (n)

### Changed
- **Phase 3 prompt vocabulary.** SSOT in `config/control-labels.ts`: Saved prompts
  (/prompts), Up next (queue), Recent dispatches (activity), Paste from history
  (composer chips). Composer hints say "auto-send" to distinguish from fleet Autopilot.

## 2026-06-28 (m)

### Added
- **Control play/pause hero.** `/control` uses `ui-control-hero` with a prominent fleet
  autopilot card (Building / Paused status, Start building / Pause fleet). Per-project
  toggles use matching Building/Paused labels; project rail shows override chips.

### Changed
- **`useAutomationPolicy`** refetches on `FLEETCROWN_REFRESH_EVENT` and broadcasts after
  global mode changes so Control stays in sync with Settings.

## 2026-06-28 (l)

### Changed
- **Retired `swiss-longevity-hub`.** Merged into `surf-your-life` (renamed product);
  removed from `scripts/hetzner/apps.conf`; dropped orphaned `swiss_longevity_hub`
  Postgres database on the box. Prod fleet: **18** projects.
- **`Bitbaum` runtime linked.** `user_projects` row now points at `/home/g/dev/bitbaum`
  for Fleet Runner dispatch.

## 2026-06-27 (k)

### Fixed
- **`applyProjectProfile` batch writes.** Attribute upserts run in one transaction
  (fixes ETIMEDOUT when enriching prod over a remote DB connection).
- **Prod backfill complete.** petvity, sbb-lost-found, and Bitbaum now have full
  build-contract profiles; 20/32 projects indexed with architecture attrs.

## 2026-06-27 (j)

### Added
- **Memory → Fleet knowledge card.** Shows RAG on/off, indexed chunk counts by
  source type, and last reindex time when `EMBEDDINGS_BASE_URL` is configured.
- **`scripts/hetzner/install-fleet-rag.sh`** — SSOT for box embed server, env
  vars, and daily reindex timer.
- **`scripts/test/rag-retrieval.ts`** — verifies retrieval against the vector index.

## 2026-06-27 (i)

### Fixed
- **Cloud dispatch context.** Phone/Loki/beacon `/api/inject` paths now assemble the
  full prompt (operating principles, project profile, goals, intent template, fleet
  RAG) before queueing for Fleet Runner — same SSOT as Control → orchestration/run.
- **AI profile persistence.** Brief/enrich now saves `architecture`, `conventions`,
  and `definition_of_done` (were extracted but dropped on write).

### Changed
- **Project context injection.** Dispatch prompts now include `customers` and
  `next_step` alongside mission/stack/DoD. Build-contract fields have dedicated
  rows in the project drawer.
- **Fleet RAG embed-on-write.** Profile/attr/description saves reindex the
  project's `knowledge_embeddings` chunk when `EMBEDDINGS_BASE_URL` is set.

### Added
- **`src/lib/inject-prompt.ts`** — SSOT for inject prompt assembly (cloud + local).
- **`scripts/test/inject-prompt.ts`** — verifies assembled prompts carry context.

## 2026-06-27 (h)

### Fixed
- **Mobile overlays.** Drawers and modals hide the bottom nav and top bar
  (`fc-overlay-open`) so project profiles and Loki slide-overs use the full screen.
- **Projects mobile.** Drawer close button moved to the title row; tab bar and
  card action links meet 44px tap targets.

### Added
- **`scripts/mobile-pages-audit.mjs`** — Playwright sweep of main routes at 390px.

## 2026-06-27 (g)

### Changed
- **Terminal on mobile.** Expand/collapse full-screen mode hides bottom nav and
  top bar so xterm gets usable height; agent tabs use a dropdown on phones.
  Loki dispatch footers link to `Watch agent →` on `/terminal?source=machine`.
- **Loki develop handoff.** Phrases like "let's develop" resolve to a command
  (`next_best` dispatch) when a project is selected or named, not idle chat.

## 2026-06-27 (f)

### Changed
- **Project profile drawer.** Overview tab follows action-first hierarchy: issues and
  next step up top, filled profile fields only (no empty placeholder spam), business
  plan and developer sections behind progressive disclosure. Activity in the drawer
  filters autopilot noise and caps at eight items with a link to the full timeline.

## 2026-06-27 (e)

### Fixed
- **Duplicate project entities.** Case-insensitive duplicates (e.g. `botsmann` /
  `Botsmann`) merge in Postgres via `scripts/db/merge-duplicate-projects.ts`.
  `findOrCreateProjectEntity` and `createProject` now resolve names
  case-insensitively so duplicates cannot recur.

### Changed
- (continues 2026-06-27 (d) Projects UI hierarchy work)

## 2026-06-27 (d)

### Changed
- **Projects page hierarchy.** Search and filters in one sticky bar; redundant stat
  cards and freeform status chips removed. Attention projects use rich cards;
  the rest is a compact scannable list with “Show all”. GitHub CI hides on cloud
  when unavailable. Duplicate project names collapse to the richest row.
- **Projects URL state.** Search, filter, and open drawer sync to query params.
- **Activity previews.** Recent activity in project profiles redacts tokens/secrets
  and collapses by default. Drawer exposes `role="dialog"` for assistive tech.

## 2026-06-27 (c)

### Changed
- **Projects page redesign.** Summary stats, filter chips, grouped sections (needs
  attention / yours / team), richer project cards with next-step callouts and
  quick actions, collapsible GitHub CI panel scoped to linked repos, and clearer
  empty/search states.

## 2026-06-27 (b)

### Changed
- **Theme control.** Light / Dark / Auto is now a single cycle button in the top bar,
  sidebar footer, and mobile menu — not three separate buttons. Settings uses one
  dropdown.
- **Mobile navigation.** Bottom bar is Today · Control · Loki · Menu; the Menu sheet
  lists routes by sidebar section (Work / Private / Site) with appearance, settings,
  and sign-out in the footer.

## 2026-06-27

### Added
- **Responsive design SSOT.** `docs/development/responsive-design.md` documents mobile
  chrome tokens, shell layout, component patterns, audit commands, and a viewport
  testing checklist.

### Changed
- **Mobile shell and viewport math.** Layer 1 tokens (`--app-topbar-height`,
  `--app-viewport-height`) plus `.app-viewport-pane` / `.app-page-compact` replace
  ad-hoc `100vh` heights on Loki, Terminal, and workspace routes.
- **Control project rail on phones.** Vertical project list instead of a hidden
  horizontal scroll strip.
- **Public marketing surfaces.** Hero fold, lede typography, nav padding, and signed-out
  CTA tuned for narrow viewports.

### Fixed
- **Mobile usability across the app.** Loki composer stacks on phones (no horizontal
  overflow); modals respect bottom-nav inset; drawers scroll with safe-area padding;
  Terminal "My machine" tabs stack above the xterm pane; Habits/People/Projects detail
  layouts wrap on narrow screens; horizontal page scroll contained at the shell.

## 2026-06-25

### Added
- **Fleet-knowledge RAG (pgvector).** Captain-layer retrieval-augmented context: a
  `knowledge_embeddings` vector index over project profiles + dev-logs (never repo
  code — the runtime retrieves that itself). Dispatches now carry a "Relevant context
  from your other projects" block, retrieved against the task. Local embeddings via a
  fastembed server on the box (BAAI/bge-small-en-v1.5, 384-dim, no cloud key); daily
  reindex. Engine under cross-project reference; first real fix for the
  "memory is the weakest strut" gap. Docs: `docs/architecture/fleet-knowledge-rag.md`.
- **Hosted runner via Hermes.** When the local Fleet Runner is offline, a work dispatch
  is auto-routed to a hosted runner that orchestrates Nous Research's **Hermes** (Nous
  Portal, `qwen3-coder-next`) in a sandbox, makes the change, and **opens a PR** — instead
  of the command waiting forever. systemd timer + dedicated runner deployment on the box.
- **Settings → Voice.** A per-user writing-voice preference, injected into Loki's replies
  (both the gateway agent and the Groq fallback) and drafted content. Backed by a
  `thoughts-style-guide.md` house-voice SSOT.
- **Cross-product specs.** `docs/architecture/cross-project-reference.md` (1 target · N
  references) and the RAG design.

### Changed
- **Public hero shows the real fleet.** The landing console now renders the owner's
  *actual* fleet (real project names, real one-line descriptions, real counts, live
  running status) instead of fabricated data — and only says "LIVE" when an agent is
  actually running. No invented metrics ship.
- **Public profile (`/u/…`) reskinned** onto the always-dark `PublicSurface` (it was the
  lone public page rendering light), with a flagship hierarchy, real descriptions, and a
  "Fleet activity" section (recent agent runs) — liveness a repo list can't show.
- **Project descriptions backfilled** from real sources; the "Local repository imported
  from fleetcrown-ui" placeholder is suppressed everywhere (profile, hero, RAG).

### Fixed
- **Real-name leak.** Loki addressed the operator by their real name (the shared OpenClaw
  agent's persona/memory held it). Scrubbed across the agent's `USER.md`/`SOUL.md`/memory +
  the FleetCrown source; Loki now uses the pseudonym. The internal routing slug is
  unchanged (cross-surface session continuity preserved).
- **Orphaned-session / stale identity** healing in the auth JWT callback (earlier in the series).
