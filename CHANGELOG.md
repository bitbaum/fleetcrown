# Changelog

Notable, user-facing changes. Older history lives in the git log (conventional commits).

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
