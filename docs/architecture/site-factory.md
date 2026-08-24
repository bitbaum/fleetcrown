# OrangeCat Site Factory — first principles

**created_date:** 2026-08-20  
**last_modified_date:** 2026-08-20  
**last_modified_summary:** Initial architecture — subdomain sites, import pipeline, fleet discipline hooks.

---

## What we are building

OrangeCat is not only a social/economic platform. It is also a **site factory**:

> Any business owner can get a credible website at **`{slug}.orangecat.ch`**. They look first; buying is optional.

That requires three layers that must not be conflated:

| Layer | SSOT | Question it answers |
|-------|------|---------------------|
| **Hosting** | `scripts/hetzner/apps.conf` + Caddy | Where does this site run? |
| **Product code** | One git repo per site (usually) | What does the app do? |
| **Sales narrative** | OrangeCat actors / FleetCrown projects | Who is the prospect and what did we show them? |

Mixing these produces the failure mode we already lived: merged fixes on GitHub, five-month-old production, and twenty-five repos each reinventing cron auth.

---

## First principles

### 1. One concern, one home

- **Identity & economy** → OrangeCat platform (`actors`, wallets, OIDC).
- **Build & deploy** → FleetCrown + Hetzner scripts (`apps.conf`, `deploy.sh`, `sync-infra.sh`).
- **Site content** → the app's repo (or imported manifest until code exists).
- **Cross-app patterns** → shared packages (`@fleet/*`), not copy-paste.

Separate *where state lives* from *where it is rendered* — same move as `PLATFORM_AND_COLLABORATION.md`.

### 2. Provisioning is mechanical, not heroic

Adding a customer site today:

1. Row in `apps.conf` (name, port, domain, repo, db).
2. `provision-site.sh` → `sync-infra.sh` → `gen-env.sh` → first `deploy.sh`.
3. DNS A record → `167.233.22.31` (Infomaniak `orangecat.ch` zone).
4. Deploy shim in repo (`.github/workflows/deploy.yml`).

No step should require remembering oral tradition. **Provisioned ⇒ monitored** (watchdog refreshed by `sync-infra.sh`).

### 3. Import before invent

When a prospect already has a site:

```
existing URL  →  import-site.ts  →  site manifest (JSON)
                      ↓
              fork OSS repo OR scaffold from site-template
                      ↓
              provision-site.sh  →  {slug}.orangecat.ch live
```

**Open source:** if the target publishes a license we can use (MIT, Apache-2.0, etc.), clone and improve — do not greenfield duplicate. The import manifest captures *what* to preserve; the repo captures *how*.

**Proprietary / unknown:** scrape structure and copy into our Next template. Visual parity is the sales goal, not pixel-perfect cloning of minified React bundles.

### 4. Infinite subdomains, finite box discipline

Each site = one Node process + one port + one Caddy block. That scales to dozens on bitbaum today; hundreds need either disk rescale or a second box — not wildcard routing into one process until we have a real multi-tenant runtime.

Ports **4001–4004** are reserved (bridge, fleetcrown, orangecat, revampit). **4005+** come from `apps.conf`; `provision-site.sh` allocates the next free port.

---

## Site manifest (import output)

`scripts/site-import/import-site.ts` writes:

```json
{
  "sourceUrl": "https://example.ch",
  "scrapedAt": "2026-08-20T12:00:00Z",
  "title": "Example GmbH",
  "description": "...",
  "language": "de",
  "nav": [{ "label": "Home", "href": "/" }, { "label": "Kontakt", "href": "/kontakt" }],
  "pages": [{ "path": "/", "title": "...", "headings": [], "paragraphs": [], "links": [] }],
  "assets": [{ "url": "...", "type": "image", "alt": "..." }],
  "contact": { "emails": [], "phones": [], "addresses": [] },
  "styleHints": { "primaryColor": "#...", "fontFamilies": [] },
  "openSource": { "detected": false, "repoUrl": null, "license": null }
}
```

Human review before any manifest becomes production content. Same guardrail as revamp-info scrape scripts.

---

## Relationship to OrangeCat platform

- **Site factory** = FleetCrown/Hetzner concern (this doc).
- **OrangeCat platform** = identity, messaging, economy (`PLATFORM_AND_COLLABORATION.md`).
- A customer site may later **Login with OrangeCat** for staff or payments — but the factory works without that coupling on day one.

---

## Implementation map

| Artifact | Path |
|----------|------|
| Fleet manifest | `scripts/hetzner/apps.conf` |
| Provision CLI | `scripts/hetzner/provision-site.sh` |
| Import CLI | `scripts/site-import/import-site.ts` |
| Fleet discipline | `docs/standards/fleet-discipline.md` |
| CD onboarding | `docs/infrastructure/self-host-cd.md` |

---

## What we explicitly do not do (yet)

- Wildcard `*.orangecat.ch` → single multi-tenant Next app (breaks env isolation).
- Infomaniak DNS API automation (manual A record checklist for now).
- Auto-writing scraped content to production DBs without review.
- Restoring Neon/Vercel deploy paths — production is bitbaum only.
