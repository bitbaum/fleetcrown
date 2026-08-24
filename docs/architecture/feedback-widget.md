# FleetCrown Feedback Widget

**Created:** 2026-07-17  
**Last modified:** 2026-08-15  
**Last modified summary:** Captain-initiated queue returns Control + Activity watch URLs; UI never presents “dispatched” as finished; web push + Telegram fire when that run closes. Settings → Notifications and the top-bar bell are the subscribe path.

**Status**: COMPLETE 2026-07-28. Phases 1–4 implemented 2026-07-17 — four
`feat(feedback):` commits (ingest spine, embed bundle, inbox + dispatch,
self-dogfood); find them with `git log --oneline --grep 'feat(feedback)'`.
Prod activation done 2026-07-17 (box DDL + FEEDBACK_WIDGET_TOKEN). Customer #1
cutover done 2026-07-28: revampit/evig prod (revampit.orangecat.ch) loads the
embed via `FleetCrownFeedbackEmbed` (revampit main 90bfb3497; retired React
widget deleted in 6341ac7f1), verified e2e — a prod submission lands in this
inbox. Hardening learned from the cutover: the OPTIONS preflight reflects
`Access-Control-Request-Headers`, because customer sites monkey-patch
window.fetch and stamp extra headers (revampit stamped x-csrf-token) onto the
widget's cross-origin POST — a hardcoded allowlist silently drops submissions.
The per-token Origin allowlist in POST remains the security boundary. Embed
supports `data-fc-bottom` to offset the FAB above a host site's own FAB.

## Captain loop (one-click north star)

```
Enable & install (Control coverage / project Widget)
        ↓
Visitor FAB on every managed site  →  POST /api/feedback
        ↓
Control strip (auto-expands)
        ↓
  1 item  →  Implement
  2+      →  Implement all as one   (preferred for a single coherent pass)
  3+      →  Synthesize themes    (optional second triage gate)
        ↓
injectPrompt SSOT  →  local Fleet Runner if connected, else cloud builder
        ↓
Run succeeds  →  captain notification (web push + Telegram) + feedback auto-resolves (+ optional reporter email)
```

**You do not choose a terminal.** Implement never targets “this Cursor chat” or
“FleetCrown’s Terminal page” directly. It injects into the **project’s agent
session** through `injectPrompt` (`src/lib/inject-core.ts`): PTY / Fleet Runner
when online, otherwise the hosted cloud builder queue (Hermes when local is
offline). Control / Terminal / Loki are captain surfaces that *also* call the
same SSOT — feedback Implement is that path with a composed prompt.

Successful captain injects set `payload.notifyOnClose`. Close fires web push
(and Telegram if configured). Autopilot / idle-nudge does **not** opt in.

### Surfaces

| Action | Where |
| --- | --- |
| Enable & install (token + agent embed) | Control coverage strip; project Widget card |
| Review open reports | Control feedback strip (new + in-progress); `/projects/{id}#feedback` |
| Implement / Retry | Same rows — status is **Not started → Queued → Working now → Done** (or **Not running / Failed**) |
| Watch live output | Only while **Working now** → Terminal. Otherwise **Open on Control** (empty Terminal ≠ progress). Notification when the run finishes. |
| Pause widget (instant, no deploy) | Project Widget card |

**Enable & install preflight** (`POST …/widget-token/install`):

1. **No git URL and no local dir** → `422 no_repo` — agent cannot land the snippet; copy from Widget card instead.
2. **Live site unreachable** (probe of `user_projects.liveUrl`, else legacy attrs) → `422 site_unreachable` — widget cannot appear until the Hetzner host responds; token may already exist.
3. Only then queue `injectPrompt` (Fleet Runner on this computer if connected, else cloud box-runner). Response includes `watchUrl` (Control), `activityUrl`, `terminalUrl`. Terminal is empty until a session is actually running. Captain gets a notification when the run finishes.

**One-click captain loop (intended):**

1. **Enable & install** → agent edits repo → push/deploy on Hetzner → widget boots → coverage shows Live.
2. Visitor reports → inbox → **Implement** → same inject path → agent works → **Watch** only while Working (Terminal) / otherwise Control.
3. Done when work phase is Done (or you Resolve); not when the API said “queued.”

Status vocabulary is SSOT in `lib/feedback/work-phase.ts`. The DB may still store
`dispatched`; the UI never presents that word as “finished.” **Queued / Install queued
is not proof of work** — prove it with Working now, Failed/Not running, or Attention Retry.
If the UI says queued, Control and Activity are the watch surfaces; Terminal only while
Working. `notifyOnClose` is the Done/Failed ping.

Dogfood check 2026-08-14: botsmann.orangecat.ch boots `fcw_73518de7…` (`last_seen_origin`
https://botsmann.orangecat.ch, `/api/widget-boot` `{active:true}`). Earlier “waiting for
first page load” was CSP (`script-src` blocked widget.js) after Next tree-shook an empty
build-time token — not a dead ingest pipe.
**Origin**: Extract revampit's visitor-feedback FAB (`src/components/feedback/`, ~900 lines,
modular, survived the Hirn deletion intentionally) into a FleetCrown-owned embeddable
widget. Any registered project drops one script tag on its site; visitor feedback flows
into a per-project inbox in FleetCrown and becomes dispatchable agent work.

## Why this is a FleetCrown feature, not a revampit feature

FleetCrown's thesis is captain-mode: see + govern work across agents you've deployed.
Visitor feedback is inbound work discovery — today it dies in email inboxes. Closing
visitor-feedback → project inbox → agent dispatch makes feedback actionable fleet work.
It is also the first embeddable FleetCrown surface on customer sites (revampit =
customer #1, dogfood).

## The one-sentence architecture

FleetCrown serves a self-contained script (`/widget.js`); the script renders the
feedback FAB in a Shadow DOM on the customer's page and POSTs submissions to
`POST /api/feedback` keyed by a per-project widget token; FleetCrown persists first,
surfaces an inbox on the project detail page, and each item has a one-click
Implement that routes through `injectPrompt`.

## Decisions (with reasoning)

### 1. Serve routes, don't ship an npm package

Consistent with `cross-product-identity-bridge.md` (embed-don't-share-UI). Customers add:

```html
<script src="https://<fleetcrown-host>/widget.js" data-fc-project="fcw_..." async></script>
```

One tag, zero build-step integration, and we can ship widget fixes to every customer
site instantly. An npm package would freeze old versions into customer bundles.

### 2. Script tag + Shadow DOM, NOT an iframe

The killer feature of the revampit widget is **element scope**: the visitor clicks the
actual broken element and we capture `elementType` / `elementText` / CSS `selector`.
An iframe cannot reach the host DOM, so iframe embedding is structurally incompatible
with element picking. Therefore: script tag, with all UI rendered inside a Shadow DOM
so host CSS and widget CSS cannot bleed into each other.

### 3. Rebuild the UI framework-free; port the logic 1:1

The revampit implementation is React + next-intl + shadcn — it cannot mount on
arbitrary customer sites (WordPress, static HTML, Vue, ...). The widget is rebuilt as
a dependency-free vanilla TS bundle (~10–15 KB gz, esbuild). What ports nearly 1:1
because it's DOM-level, not React-level:

- `useElementSelection` → element highlight + selector computation + click capture
- `useKeyboardShortcuts` → Esc closes, Ctrl+Enter submits
- The submission shape (see schema below)
- The interaction design: FAB → panel → scope selector (element | page | site) →
  optional element picking → textarea + optional contact → submit → success state

revampit's React widget is retired in Phase 4 and replaced by the embed tag
(customer #1 dogfood).

### 4. Dedicated `widget_tokens` table — do NOT reuse `project_shares`

`project_shares.token` grants *read* access to a dossier and is revoked/rotated on
different lifecycles. The widget token grants exactly one capability: *submit feedback
to this project*. Coupling them means revoking a share link silently kills a
customer's widget. Separate table, same shape/pattern.

The token is public by design (visible in page source). That is fine because it
authorizes only writes into an inbox, never reads — worst case is spam, which rate
limiting and per-token revocation handle.

### 5. Persist-first pipeline (proven in revampit)

revampit's `/api/suggestions` learned this the hard way: DB insert is the channel that
never silently drops; notifications and email are best-effort layered on top, with
results checked. Same order here: 1) insert `site_feedback`, 2) in-app surfacing
(inbox badge is derived from the table — no extra write), 3) optional email/Telegram
notification later.

## Schema (Drizzle, `src/db/schema/`)

```ts
// widget-tokens.ts
export const widgetTokens = pgTable("widget_tokens", {
  id:        uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:     text("token").notNull().unique(),          // "fcw_" + 32 random hex
  origins:   jsonb("origins").$type<string[]>(),        // CORS allowlist; null/empty = any
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// site-feedback.ts
export const siteFeedback = pgTable("site_feedback", {
  id:               uuid("id").primaryKey().defaultRandom(),
  projectId:        uuid("project_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId:           uuid("user_id").notNull().references(() => users.id),  // project owner, denormalized for inbox queries
  tokenId:          uuid("token_id").references(() => widgetTokens.id, { onDelete: "set null" }),
  suggestion:       text("suggestion").notNull(),        // 1..2000 chars, clamped at API
  contact:          text("contact"),                     // optional name/email
  page:             text("page"),
  url:              text("url"),
  pageTitle:        text("page_title"),
  scope:            text("scope"),                       // element | page | site
  selectedElements: jsonb("selected_elements").$type<Array<{elementType: string; elementText: string; selector: string}>>(),
  userAgent:        text("user_agent"),
  source:           text("source"),                      // visitor | ai_review | synthesizer (null = legacy = visitor)
  contentHash:      text("content_hash"),                // sha256(normalized suggestion + page) — ingest dedupe key
  duplicateCount:   integer("duplicate_count").notNull().default(1),  // repeat submissions bump this instead of new rows
  screenshot:       text("screenshot"),                  // optional visitor-attached image (data URL ≤600k chars); excluded from list queries, served via GET /api/feedback/[id]/screenshot
  status:           text("status").notNull().default("new"),  // new | dispatched | resolved | archived
  dispatchedRunId:  uuid("dispatched_run_id"),           // link to orchestration run once dispatched
  resolvedAt:       timestamp("resolved_at", { withTimezone: true }),  // resolution evidence (close-the-loop or manual)
  featuredAt:       timestamp("featured_at", { withTimezone: true }),  // operator curation for the public "shipped thanks to feedback" strip
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_site_feedback_project").on(t.projectId, t.status),
  index("idx_site_feedback_user").on(t.userId, t.status),
  index("idx_site_feedback_dedupe").on(t.projectId, t.contentHash),
]);
```

Status flow: `new → dispatched → resolved`, or `new → archived`. Mirrors the action
queue's philosophy: nothing auto-dispatches; the operator triages.

## API surface

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /widget.js` | public | The embed bundle. Built by esbuild from `widget/` at build time into `public/`; immutable-cached with a version query. |
| `POST /api/feedback` | widget token in body | Ingest. Zod-validate, clamp lengths, resolve token → project (reject revoked), rate limit per IP+token, insert, `jsonOk`. |
| `OPTIONS /api/feedback` | public | CORS preflight. Echo origin if it passes the token's `origins` allowlist (or any when unset). |
| `GET/POST/DELETE /api/projects/[id]/widget-token` | session | Owner manages the token: create, view snippet, revoke/rotate. |
| `GET /api/projects/[id]/feedback` + `PATCH /api/feedback/[id]` | session | Inbox list + status transitions (archive, resolve). |

Gotchas already known:
- **CSP on the host site**: `script-src` and `connect-src` must allow the FleetCrown
  origin (`https://fleetcrown.orangecat.ch`). Botsmann shipped the tag but stayed
  “Waiting for the first page load” because CSP blocked `widget.js` (2026-08-14).
  Coverage Live = boot heartbeat after the script actually runs, not after HTML contains the tag.
- **proxy.ts allowlist** (Next 16 middleware): `api/feedback` and `widget.js` must be
  added to the matcher exclusions or anonymous submissions bounce to /sign-in
  (same class as the OC-rail `proxy.ts` lesson).
- **No rate limiter exists in FleetCrown yet** — port revampit's small
  `src/lib/security/rate-limit.ts` (in-memory buckets, `getClientIdentifier`) as
  `src/lib/rate-limit.ts`. Sufficient for a single-box deployment.
- CORS: this is a cross-origin POST from customer sites. `Content-Type: application/json`
  triggers preflight — the OPTIONS handler is not optional.

## Inbox UI (Phase 3)

Per the UX north star (minimize clicks, act in place, lead with the one thing that
matters):

- **ProjectDetail → Feedback tab**: list of `site_feedback` rows for the project,
  `new` first, badge with new-count on the tab. Each row shows suggestion, page,
  scope chip, selected-element selectors, age.
- **Primary action per row: Implement** — one click composes a prompt through
  `injectPrompt` with full context baked into the intent
  ("Visitor feedback on {url}: {suggestion}. Element(s): {selectors}"), sets
  `status=dispatched` (DB), stores `dispatchedRunId`. UI shows **Queued**, with
  Control / Activity links and a notification when the run finishes.
- **Secondary actions**: resolve, archive. Delete only via archive (audit trail).
- **Widget setup card** on the same tab: generate token → copy-paste snippet
  (one-click copy), origins field, rotate/revoke. Empty state of the Feedback tab IS
  the setup card — discovery and activation in one place.
- Optional later: aggregate "Feedback" strip on /control per-project cards.

## Phases

1. **Ingest spine** — schema push, `widget_tokens` + `site_feedback`, `/api/feedback`
   (+ CORS + rate limit), proxy.ts exclusions, token-management route. Testable with
   curl before any UI exists.
2. **Embed bundle** — `widget/` vanilla-TS source (FAB, panel, scope selector, element
   picker, form), esbuild → `public/widget.js`, Shadow DOM styles. Verify on a plain
   static HTML page AND on a Next.js site.
3. **Inbox + dispatch** — Feedback tab on ProjectDetail, dispatch-fix wiring, setup
   card with snippet copy.
4. **Dogfood cutover** — drop the tag on FleetCrown's own public pages (/, /thoughts,
   /frontier) pointed at the FleetCrown project; then revampit swaps its React widget
   for the embed tag (its `site_suggestions` pipeline retires; optional dual-write
   during transition).
5. **AI reviewer (shipped with prod activation)** — `POST /api/projects/[id]/feedback/ai-review`
   dispatches an agent (via the `injectPrompt` SSOT) to open a page headless
   (Playwright), review it on desktop + 320px mobile, and file each finding
   through the same public `POST /api/feedback` + `fcw_` token a human visitor
   uses (`contact: "FleetCrown AI reviewer"`). Human and AI feedback share one
   inbox and one triage flow; review runs never auto-dispatch fixes. UI: "AI
   review" button on the project feedback section (needs an active widget token).
6. **Later (not now, YAGNI)** — email loop back to submitter, screenshot capture,
   auto-triage draft actions via the action queue, per-page analytics, theming API,
   site-wide crawl review, conversational widget (Loki-in-widget — needs its own
   security model; the fcw_ token stays write-only).

## Out of scope

- Reading anything through the widget token (write-only by construction).
- npm-published widget package.
- Multi-language widget UI (ship English; revampit's German strings become a simple
  `data-fc-lang` attribute later if needed).
- Screenshots/replay — big surface, privacy questions; not in v1.
