# Cross-Product Identity Bridge — "Login with OrangeCat" + Project/Changelog Sync

**Status:** Design / not yet built.
**Last updated:** 2026-06-16
**Scope:** FleetCrown ↔ OrangeCat. Touches both repos.

This is the spec for unifying identity across FleetCrown (capability layer) and
OrangeCat (identity + economy + public-presence layer), and for syncing projects
and changelogs between them. It is grounded in the real schema/auth of both
codebases as of 2026-06-16.

---

## 0. The decision this encodes

- **OrangeCat is the identity SSOT** — the *person*, the wallet, the public profile.
- **FleetCrown is a capability surface** on that identity — the *workshop* where work gets done.
- **Provisioning is lazy + consensual.** Internal plumbing may auto-create; user-facing
  accounts/projects are *suggested with one click*, never silently duplicated.
- **FleetCrown emits, OrangeCat publishes.** Projects and changelogs originate in
  FleetCrown (which holds the technical truth) and are *projected* onto OrangeCat
  (which holds the public/economic truth). Same seam as "verified-done → settlement."
- **Do NOT build profiles, walls, or messaging inside FleetCrown.** Each is an OrangeCat call.

### Grounding (what exists today)

| Fact | Source |
|------|--------|
| FleetCrown auth = Auth.js (GitHub/Google/X/credentials); `users` UUID PK, unique nullable `email`, unique `username`; public profile `/u/[username]` | `src/auth.ts`, `src/db/schema/users.ts`, `src/app/u/[username]/page.tsx` |
| FleetCrown projects = `entities`(type=project, `gitUrl`) + `user_projects`(`dirPath` local folder, `gitUrl`, `agentPref`, `modelPref`, devLog) | `src/db/schema/entities.ts`, `src/db/schema/user-projects.ts` |
| FleetCrown↔OC today = single service-account key (`ORANGECAT_API_KEY`), subscription mirror + context read. NO per-user link. | `src/lib/integrations/orangecat.ts`, `orangecat-context.ts` |
| FleetCrown hosted at `fleetcrown.orangecat.ch` (subdomain of OrangeCat) | `src/config/brand.ts` |
| OrangeCat auth = Supabase/GoTrue (relying party only — **no authorization-server**); `profiles`(UUID=auth.users.id, unique `username`, non-unique nullable `email`), auto-created via `handle_new_user()` trigger | `src/app/auth/oauthProviders.ts`, `scripts/db/schema_dump.sql` |
| OrangeCat `actors`(user/group) lazy-created via `getOrCreateUserActor()`; every entity owned by an actor | `supabase/migrations/...create_actors_table.sql`, `src/services/actors/getOrCreateUserActor.ts` |
| OrangeCat projects: `actor_id` owner, title/description, goal/currency, btc/lightning, `show_on_profile`, `status`. **No github/folder/external-id fields.** | `src/types/database.generated.ts`, `src/lib/validation/projects.ts` |
| OrangeCat `integration_keys` (actor-bound `ock_` keys, scoped) + `webhook_endpoints` + v1 API (`/api/v1`, `/api/projects`, `/api/stakeholders`) | `supabase/migrations/...integration_keys.sql`, `...webhook_endpoints.sql`, `src/app/api/v1/` |
| OrangeCat `stakeholder_relationships` with `customer` kind (FleetCrown is OC's customer) | `supabase/migrations/...stakeholder_relationships.sql` |

### Key constraints that shape the design

- **Email is a weak join key.** OrangeCat `profiles.email` is **not unique**, and FleetCrown
  X-login users have **no email**. So identity must be linked by a real OAuth subject, not email.
- **Both have a unique `username`** — usable as a *detection hint*, not the source of truth.
- **OrangeCat has no authorization-server today** — "Login with OrangeCat" is net-new there.
- **Same parent domain** (`*.orangecat.ch`) makes SSO and consent smoother.

---

## Part A — "Login with OrangeCat" (the keystone)

Yes it is possible; it is exactly how "Login with Google" works, except **OrangeCat must
become the OAuth2/OIDC _provider_** (it is currently only a _consumer_).

### Option 1 — OrangeCat as an OIDC provider (RECOMMENDED endgame)

Standard, decoupled, and reusable by every future product (hirn.li, etc.). OrangeCat builds a
small authorization-server layer; FleetCrown adds one provider config.

**OrangeCat builds (net-new):**

- `GET /.well-known/openid-configuration` — discovery document.
- `GET /oauth/authorize` — checks the user's existing Supabase session (logging them in if
  needed), shows a **consent screen**, issues a short-lived authorization code (PKCE required).
- `POST /oauth/token` — exchanges code (+ PKCE verifier) → `access_token` + signed `id_token`.
- `GET /oauth/userinfo` — returns `sub` = the user's **actor_id** (stable identity), plus
  `preferred_username`, `email` (if present), `name`, `picture`.
- `GET /oauth/jwks.json` — public keys for verifying the `id_token`.
- New tables: `oauth_clients` (client_id/secret, redirect_uris, allowed scopes) and
  `oauth_auth_codes` (short-lived codes). Reuse the existing `integration_keys` revocation pattern.
- **Scopes:** `openid profile email` *plus* OrangeCat-specific capability scopes
  (`projects.write`, `wallet.read`, …). This is the elegant part — see "One consent" below.

**FleetCrown builds (relying party — small):**

- Add a custom OIDC provider to Auth.js pointing at OrangeCat's endpoints, with a registered
  `client_id`/`client_secret`. Auth.js supports generic OIDC providers directly.
- On callback: store `orangecatActorId` (= `id_token.sub`) on the FleetCrown `users` row.
- Surface it two ways:
  - **"Sign in with OrangeCat"** on the login page (new users).
  - **"Connect OrangeCat"** in settings (existing FleetCrown users link their actor).

**One consent, both identity AND capability.** Because the authorize step can grant
`projects.write` / `wallet.read`, the same login that proves *who the user is* also returns a
token (or mints an actor-bound `integration_key`) that lets FleetCrown create OrangeCat projects
and read the user's wallet on their behalf. No separate "now also connect your API key" step.

### Option 2 — Shared-domain session cookie (interim shortcut only)

Because FleetCrown is `fleetcrown.orangecat.ch`, a cookie scoped to `.orangecat.ch` could be
shared. Faster to ship, but tightly coupled, fragile across auth stacks (Auth.js JWT vs Supabase),
and does not generalize to other products. **Use only as a stopgap if Option 1 is delayed.**
The endgame is Option 1.

### Security checklist (Option 1)

PKCE on the auth-code flow · `state` / nonce · rotating signing keys + JWKS · least-scope consent ·
token + key revocation (reuse `integration_keys.revoked_at` pattern) · short-lived codes ·
exact redirect-uri matching.

---

## Part B — Provisioning rules (auto vs. suggest)

| Thing | Policy | Why |
|-------|--------|-----|
| OrangeCat `actor` (internal) | **Auto** (already lazy via `getOrCreateUserActor`) | Internal plumbing, not a user-facing account |
| OrangeCat public **profile/account** | **Suggest + one click** | Consent, agency, email-collision risk |
| FleetCrown account from OC | **Suggest, targeted at builders** | Most OC users are not builders; blanket = noise |
| Publishing a **project** to OC | **Opt-in, per project** | Private work → public+economic = irreversible act |

**Detect-then-offer (both directions):** match on OIDC `sub` if already linked; otherwise hint on
`username`, then `email` (never link silently on email alone). 
- *FleetCrown signup* → after onboarding: match found → "Connect your OrangeCat profile"; no match
  → "Claim your public profile + wallet on OrangeCat" (prefilled from GitHub metadata).
- *OrangeCat signup* → only when a builder signal is present (owns a `project`, or connects GitHub):
  "Build this with an AI fleet → FleetCrown."

---

## Part C — Project + changelog sync

### New FleetCrown storage (the ONLY new FleetCrown tables/columns in this whole plan)

- `users.orangecatActorId` (uuid, nullable) — the linked OrangeCat actor (= OIDC `sub`).
- `user_projects.orangecatProjectId` (uuid, nullable) — the published OrangeCat project, if any.

### Publish flow (opt-in, per project)

1. FleetCrown holds the user's actor-bound capability (token or `ock_` key from Part A).
2. "Publish to OrangeCat" on a project → `POST {OC}/api/projects` with
   `{ title, description, website_url: <FleetCrown public project URL>, bitcoin_address/lightning
   from the user's OC wallet }`.
3. Store the returned OrangeCat project id on `user_projects.orangecatProjectId`.
4. Optionally create a `stakeholder_relationships` edge.

### The mapping is intentionally lossy (this is correct, not a gap)

| FleetCrown keeps (private build truth) | OrangeCat gets (public economic projection) |
|----------------------------------------|---------------------------------------------|
| `gitUrl` (repo), `dirPath` (local folder) | `website_url` = link back to FleetCrown |
| `agentPref`, `modelPref`, devLog, health | title, description, funding goal, wallet |
| orchestration runs, CI, secrets | `show_on_profile`, status, contributions |

OrangeCat projects deliberately have **no** github/folder/external-id field. FleetCrown owns the
technical record; OrangeCat owns the public listing; the cross-id joins them.

### Changelog → wall

FleetCrown emits release / `orchestration_runs` "shipped" events → OrangeCat `timeline_events`
on the user's profile (via API now; via `webhook_endpoints` for the reverse delivery/confirmation).
This is the "building in public funds itself" loop: agents ship → changelog posts → followers back it.

---

## Part D — Build order (do NOT reorder)

1. **OrangeCat OIDC provider** (Part A, Option 1) — authorize/token/userinfo/jwks/discovery +
   `oauth_clients`/`oauth_auth_codes` + consent screen. *Everything depends on this.*
2. **FleetCrown relying party** — Auth.js OrangeCat provider + `users.orangecatActorId` +
   "Sign in / Connect OrangeCat" UI.
3. **Detect-and-suggest** both directions (Part B).
4. **Project publish** + `user_projects.orangecatProjectId` (Part C).
5. **Changelog → wall** (Part C).
6. **Polish:** optional same-domain SSO niceties, cross-funding, building-in-public surfaces.

## Non-goals

- No social/wall/messaging built inside FleetCrown — all OrangeCat.
- No silent auto-creation of public accounts or published projects.
- No email-only identity matching.

## Gaps to close (from code)

- OrangeCat: build the authorization-server (none exists); decide whether to add an optional
  `source`/external-ref on projects (today the link rides on `website_url` + the FleetCrown-side id).
- FleetCrown: add the two columns; remember X-login users have no email → OIDC `sub` is the only
  reliable key (another reason Option 1 wins).
