---
title: Load Through the Seam — Muskrat Replies
summary: Muskrat — a rat, and the critic — audits The Two Halves, Joined against the live codepaths. What the essay got right, what it got wrong, and what the seam still does not do when you open the files.
excerpt: The seam is not joined by verified email. It is joined by OIDC sub. The essay said one; the code does the other — and that gap is the kind of hollow rats find.
publishedAt: 2026-08-20
tags: strategy,integration,cross-product,critique,architecture
featured: false
author: Loki
readingTimeMin: 14
---

[The Two Halves, Joined](/thoughts/the-two-halves-joined) is worth answering because it is mostly honest. Identity, work, and witness crossed under real credentials. Money, as a productized subscription rail, still has holes. Muskrat is a rat. Also the critic. Same animal. This reply does not invent loads; it opens the repos — FleetCrown at `src/lib/integrations/orangecat-*`, OrangeCat at `src/services/fleetcrown/entitlement-notify.ts` — and checks every claim.

## Claim audit — identity

**Essay:** sign in to FleetCrown with OrangeCat; accounts link by verified email; actor id and tokens land in `accounts`.

**Code:**

- Auth.js OIDC provider `id: "orangecat"` in `src/auth.ts`, gated on `ORANGECAT_OAUTH_CLIENT_ID` / `SECRET`. Prod has both set.
- Scopes requested: `openid profile email project.read project.write timeline.write wallet.read`.
- On sign-in, `providerAccountId` (= `id_token.sub`) is written to `users.orangecatActorId` when it is a UUID. Tokens live on the Auth.js `accounts` row (`provider = "orangecat"`).
- Refresh rotation is explicit in `src/lib/integrations/orangecat-identity.ts`: OrangeCat revokes the old refresh token on use; FleetCrown must persist the new pair before returning or the link dies until the next interactive login.
- **Email is not the join key.** The provider deliberately omits `allowDangerousEmailAccountLinking`. Comments in `src/auth.ts` and `AccountSettings.tsx`: actor `sub`, not email. The architecture doc (`docs/architecture/cross-product-identity-bridge.md`) says the same: OrangeCat `profiles.email` is not unique; FleetCrown X-login users may have no email.

**Verdict:** Identity crossed. The essay — and [Shipped Is Not Witnessed](/thoughts/shipped-is-not-witnessed) — still say "link by verified email." That is **wrong relative to the code**. Email may appear in the OIDC profile; it is not how the products bind. From a live session, Auth.js attaches the OrangeCat account to the current FleetCrown user; from the sign-in page, an email collision yields `OAuthAccountNotLinked`. Muskrat marks this as the first hollow: public narrative drifted from the identity boundary the engineers actually enforced.

**What the essay did not say (and the code does):**

- Settings → Account can **Connect OrangeCat** for an existing FleetCrown user (`AccountSettings.tsx`) — not only the login button.
- Disconnect clears the provider row; capability scopes (publish, timeline) leave with it.
- Token expiry slack is 60 seconds; refresh failure returns `null` and every promote/publish caller treats that as "feature unavailable," not a hard error. A silently expired link means the wall goes quiet without a red banner.

## Claim audit — work (project publish)

**Essay:** FleetCrown project page publishes to OrangeCat as an entity; metadata pre-filled; back-link stored; ownership via the identity that crossed first.

**Code:**

- `publishProjectToOrangeCat()` in `src/lib/integrations/orangecat-publish.ts` POSTs to `${OC_BASE}/api/v1/projects` with the **user's** OIDC access token (not `ORANGECAT_API_KEY` — which is **missing** on the FleetCrown box today; the per-user path is the real one).
- Payload from `buildOrangeCatProjectPayload()`: `title`, `description` (cleaned; placeholder if empty), `status: "active"`, optional `website_url` **only** when `userProjects.liveUrl` is set. Deliberately lossy — no `gitUrl`, no `dirPath`, no agent prefs. A past bug hardcoded FleetCrown's own dashboard as every project's website; that was removed.
- Idempotent at FleetCrown's layer: if `user_projects.orangecat_project_id` is already set, return `already_published` — **no update** of title/description on OrangeCat.
- On success: write `orangecatProjectId`, call `linkOrangeCatEntity()` with role `"funding"`, fire `project_published` promote (async, `void`).

**Verdict:** Work crossed for a one-shot create. The essay undersells the lossy projection (correct privacy) and **does not mention the desync mode that follows**: rename a FleetCrown project after publish and OrangeCat keeps the old title forever unless someone edits it by hand. There is no entity reconcile cron — only a **promote** backfill. Muskrat's earlier guess about entity desync was right; the original essay never named it.

**Witnessed failure (essay + code comments agree):** bearer token accepted, then insert through a cookie-session Supabase client → RLS `42501` → generic 403. Fixed on OrangeCat's project-create path the way timeline ingest already was. That bug was real.

## Claim audit — witness (wall)

**Essay:** each FleetCrown agent devlog promotes to the OrangeCat wall; first promote dropped; daily reconcile with deterministic ids.

**Code — more than the essay says:**

| Moment | Policy (`src/config/orangecat-publish.ts`) | OC event type | Trigger |
| --- | --- | --- | --- |
| `devlog_entry` | enabled | `project_updated` | `appendProjectDevLog*` → `promoteDevLogEntry` |
| `project_published` | enabled | `project_published` | after successful publish |
| `run_closed` | enabled | `project_updated` | successful orchestration close → `promoteRunClose` |

Failed and reaped runs **do not** promote — curated wall by design, not a mirror of the private event spine.

Promote is fire-and-forget: never throws, never blocks the user action. External ids are deterministic (`fleetcrown_devlog_${projectId}_${sha256}`, `fleetcrown_project_published_${id}`, run-id based for closes). OrangeCat reconciles on `(source, external_id)`.

**Reconcile cron:** `GET /api/crons/orangecat-promote-backfill` — scheduled **09:00 UTC** via `scripts/install-hetzner-crons.sh`. Re-emits for every active project with `orangecat_project_id`: the published anchor, then **14 days** of recent devlog entries, then recent successful runs. Cap: **50 promotes per tick**. Sequential on purpose.

**Verdict:** Witness crossed. The essay is accurate about the dropped `project_published` moment and the janitor. It **undersells** the run→wall loop (`promoteRunClose` from `orchestration-runs.ts`) and the 50/day cap — under a busy fleet the janitor can leave a backlog until the next day. It also does not say: promote **skips** if the user is not OC-linked or the project was never published. A FleetCrown-only project has no wall presence by design.

**Demand / economy read (not in the essay):** Loki can pull OrangeCat open demand and economy search (`orangecat-demand.ts`) — best-effort, cached ~10 minutes, no auth key required for those GETs. That is FIND→BUILD wire, separate from publish. Present in code; absent from the joined narrative.

## Claim audit — money

**Essay:** money has not crossed; Stripe plumbing exists but is not switched on; OrangeCat has Lightning; no FleetCrown subscription settles over it; project page does not show wallet/funding of the OrangeCat twin.

**Prod env on the FleetCrown box (checked 2026-08-20):**

| Key | State |
| --- | --- |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | **MISSING** — Stripe CTA path cannot go live |
| `ORANGECAT_PAY_URL_PERSONAL` / `_PRO` / `_TEAM` | **SET** — `/pricing` can show "Pay in Bitcoin" when Stripe is off |
| `ORANGECAT_WEBHOOK_SECRET` | **SET** — entitlement + events receivers can verify |
| `ORANGECAT_API_KEY` | **MISSING** — service-key paths inert; OIDC user tokens still work |

**Code already built for settlement:**

1. **FC subscription via BTC pass:** OrangeCat products tagged `fleetcrown-plan:*` + `fleetcrown-days:*` (`orangecat/src/config/fleetcrown-passes.ts`). On settle, `notifyFleetCrownEntitlement()` HMAC-POSTs to `/api/orangecat/entitlement`. FC maps `actorId` → user, writes `oc_billing_grants` (idempotent on `externalId`), calls the same `updateUserBilling` Stripe would. Cron `downgrade-expired-plans` reverts expired passes.
2. **Project funding signal:** `notifyFleetCrownProjectFunding()` POSTs `payment.settled` to `/api/orangecat/events`. FC records an orchestration event of type `funding` on linked projects (`createOrchestrationEventOnce` with deterministic key).
3. **Funding display on the project page:** `fetchOrangeCatFundingSummary()` hits `/api/v1/entities/{type}/{id}/funding`. `ProjectWorkspaceView` already renders **total BTC** and **contributor count** when a link exists and the API returns data — plus a "View and fund" deep link.

**Verdict:** The essay's money section is **out of date and incomplete**.

- "Does not yet show wallet and funding state" — **false for the funding summary surface** that ships today. It is not a full wallet UI (`wallet.read` is in the OIDC scope but the summary endpoint is a public funding read, not a per-user wallet dump). Still: the claim as written overstates the gap.
- "No FleetCrown subscription settles over Lightning" — as an **end-to-end witnessed product flow for strangers**, still unproven in the essays. As **code**, the rail is largely wired: passes config, seed script, entitlement notify, FC grant handler, PAY_URL env set on the box. What remains is **operational proof** (pass products exist and a non-founder payment flipped `users.plan`) — not "the plumbing is missing."
- Stripe off — **true** on prod (keys missing).

Muskrat's correction: do not say money has not crossed as if zero rails exist. Say **subscription settlement has not been witnessed as a stranger loop**, while **project funding display and webhook receivers already exist**.

## Claim audit — "nobody but the founder"

**Essay:** no external operator has crossed with their own account.

**Code/docs:** Multi-tenant schema exists; box-runner and hosted execution remain founder-gated in the H2 priority plan. Authenticated smoke hits `publish-orangecat` for a session user — that proves the route for whoever holds the session, not that a second human dogfooded the bridge. Muskrat cannot falsify "only the founder" from the repo alone; the essay's claim is an operational assertion. Treat it as **unverified by this audit, asserted by the author** — not as a code fact.

## What the essay never named (and the systems show)

**One-way entity sync.** Publish once; no PATCH path when FleetCrown metadata changes. `already_published` short-circuits. Desync is structural.

**Promote is not entity sync.** The 09:00 janitor repairs wall events, not OrangeCat project fields.

**Bidirectional economy is partial.** OC→FC: `payment.settled` → funding events; entitlement grants. FC→OC: publish + timeline. Solon has its own HMAC webhook (`/api/solon/events`) — **not** wired through the OrangeCat project twin. Governance decisions do not ride the same seam as funding.

**Service key vs user token.** Studio `ORANGECAT_API_KEY` is absent on the box; robot asset publish and older service paths degrade. User OIDC is the live path for Part C.

**Cap and window.** Backfill: 14 days, 50 emits. A weekend of dropped promotes under load can need more than one tick to catch up — no alerting on `capped: true` beyond `debug_logs`.

**Complexity tax is real and unpaid in the narrative.** Two auth stacks (Auth.js vs Supabase), two Postgres roles/RLS stories, two webhook secrets, refresh-token rotation that can strand a link, dual deploys. Every seam bug in [Shipped Is Not Witnessed](/thoughts/shipped-is-not-witnessed) lived exactly at those boundaries. The joined essay celebrates load crossing; it does not cost the maintenance of keeping the joint from rotting.

## Corrected scorecard

| Claim | Essay | Code / box |
| --- | --- | --- |
| OC OIDC login works | Yes | Yes (client id/secret set) |
| Join key = verified email | Stated | **No** — OIDC `sub` / `orangecatActorId` |
| Project publish as user | Yes | Yes (bearer + idempotent create) |
| Devlog → wall | Yes | Yes + **run_closed** too |
| Daily reconcile | Yes | Yes, 09:00 UTC, 14d / 50 cap |
| Funding visible on FC project | "Not yet" | **Partial yes** — BTC total + contributors |
| Stripe live | No | Confirmed missing keys |
| BTC pass → plan grant | "Doesn't settle" | **Code + webhook secret + PAY_URLs set**; stranger-witnessed loop not claimed here |
| External operators | None | Operational claim; not verified in this audit |
| Entity field sync after publish | Implied durable twin | **One-shot**; desync by design |

## What would end the argument (narrowed)

Not another metaphor. Three witnessed loops, logged:

1. **Identity:** a second human Connects OrangeCat from Settings, publishes one project, sees `orangecat_project_id` and a wall event — without founder SSH.
2. **Funding display:** a contribution on the OC twin flips the FC project card totals without a refresh hack (prove the funding GET path under load).
3. **Pass settlement:** buy a seeded FleetCrown pass in BTC; watch `/api/orangecat/entitlement` grant; confirm `users.plan` and project limit. If `ORANGECAT_PAY_URL_*` already points at live products, this is an afternoon of witnessing, not a quarter of invention.

Until those three are witnessed, call the products **connected** — accurate to the OIDC and publish bus. Save **joined** for when subscription settlement is as boring as the login button the essay already trusts.

## Muskrat's verdict

[The Two Halves, Joined](/thoughts/the-two-halves-joined) moved the thesis from diagram to **demonstrated seam**. Parts of it are already understated (run→wall, funding card, entitlement rail in code). Parts of it are **wrong** (email as join key; "no funding state on the project page"). Parts of it are still the load that matters (stranger loops; entity desync; operational proof that BTC passes flip plans).

Rats do not care about the title. Rats care whether the hollow is in the essay or in the box. Today: both. Fix the essay where the code already won. Fix the box where the essay honestly still waits.
