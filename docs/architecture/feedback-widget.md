# FleetCrown Feedback Widget

**Status**: Phases 1–4 implemented 2026-07-17 — four `feat(feedback):` commits
(ingest spine, embed bundle, inbox + dispatch, self-dogfood); find them with
`git log --oneline --grep 'feat(feedback)'` (hashes not pinned here — a
concurrent session rewrote history once already on implementation day).
Remaining: revampit cutover (customer #1, lives in the revampit repo) and prod
activation — run the widget_tokens/site_feedback DDL on the box (drizzle push
is TTY-blocked by the pre-existing agent_tokens prompt), then mint a
fleetcrown-project token and set FEEDBACK_WIDGET_TOKEN in the app env.
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
"Dispatch fix" that routes through the existing `/api/control/dispatch` flow.

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
  status:           text("status").notNull().default("new"),  // new | dispatched | resolved | archived
  dispatchedRunId:  uuid("dispatched_run_id"),           // link to orchestration run once dispatched
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_site_feedback_project").on(t.projectId, t.status),
  index("idx_site_feedback_user").on(t.userId, t.status),
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
- **Primary action per row: "Dispatch fix"** — one click composes a dispatch through
  the existing `/api/control/dispatch` flow with full context baked into the intent
  ("Visitor feedback on {url}: {suggestion}. Element(s): {selectors}"), sets
  `status=dispatched`, stores `dispatchedRunId`. Feedback becomes fleet work without
  leaving the row.
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
5. **Later (not now, YAGNI)** — email loop back to submitter, screenshot capture,
   auto-triage draft actions via the action queue, per-page analytics, theming API.

## Out of scope

- Reading anything through the widget token (write-only by construction).
- npm-published widget package.
- Multi-language widget UI (ship English; revampit's German strings become a simple
  `data-fc-lang` attribute later if needed).
- Screenshots/replay — big surface, privacy questions; not in v1.
