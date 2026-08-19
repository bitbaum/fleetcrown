# Fleet discipline — cross-repo standards

**created_date:** 2026-08-20  
**last_modified_date:** 2026-08-20  
**last_modified_summary:** Initial checklist — SSOT, security gates, i18n, deploy, import pipeline.

---

Every OrangeCat studio repo should pass this checklist before we call it **launch-ready** or ship it to a prospect at `{slug}.orangecat.ch`.

Derived from first principles: **divergence in security is a vulnerability; divergence in copy is embarrassment; divergence in deploy is an outage.**

---

## Infrastructure SSOT

- [ ] `docs/INFRASTRUCTURE.md` or `CLAUDE.md` states: box IP, `/opt/<app>/`, env path, DB name, public URL.
- [ ] Row exists in `fleetcrown/scripts/hetzner/apps.conf` (if self-hosted on bitbaum).
- [ ] No `neon.tech`, `vercel.app`, or decommissioned cloud DB URLs in docs or committed env samples.
- [ ] `.github/workflows/deploy.yml` shim → `maonakamoto/fleetcrown/.github/workflows/selfhost-deploy.yml`.
- [ ] Runtime secrets live on the box (`/opt/<app>/shared/.env`), not duplicated across GitHub secret stores.

---

## Deploy loop closes

- [ ] `npm run verify` (or equivalent) matches CI jobs: lint, typecheck, test.
- [ ] Push to default branch triggers deploy **after** CI green (`ci-gate.sh`).
- [ ] Health check passes on box and public HTTPS URL after deploy.
- [ ] Rollback path documented (`rollback.sh <app>`).

---

## Security gates (Class 1 — share + assert)

These **fail closed** when env is missing:

- [ ] Cron routes use shared `requireCronAuth()` — never inline `Bearer ${process.env.CRON_SECRET}` without guarding absent secret.
- [ ] Stripe webhooks verify signatures.
- [ ] Session secrets required in production (`SESSION_SECRET` ≥ 32 chars).
- [ ] Admin/staff actions go through permission checks, not ad-hoc role string compares in pages.

See `petvity/.../repeatable-across-projects.md` for the measured duplication inventory.

---

## User journey closure

Every redirecting action must give feedback:

- [ ] `UrlFeedbackToast` or equivalent for `?error=` / `?success=` query params.
- [ ] Filter/search empty states link to reset or next step — not dead ends.
- [ ] Form failures show inline or toast — not silent no-ops.
- [ ] Messaging: send failure visible; unread counts reliable.

Pattern established in AOZ Begleitung (`PortalUrlFeedback`, `AdminUrlFeedback`).

---

## i18n (when residents or public see it)

- [ ] User-visible strings through dictionary/`useT()` — not German-only constants in portal surfaces.
- [ ] New keys added to **all** locale files (or CI i18n gate fails).
- [ ] Swiss High German: `ss` not `ß`; local terms (Velo, Grüezi) where appropriate.

---

## Public route honesty

- [ ] Pages in `(public)` route group listed in `PUBLIC_ROUTES`.
- [ ] `public-routes-reachable.test.ts` (or equivalent) passes — declared public = actually reachable without session.
- [ ] Admin layouts do not accidentally wrap marketing pages.

---

## Site factory onboarding (new customer site)

- [ ] `provision-site.sh <slug> --domain <slug>.orangecat.ch --repo /home/g/dev/<repo>`.
- [ ] DNS A record added at Infomaniak.
- [ ] Optional: `import-site.ts <url>` → review manifest → scaffold content.
- [ ] Project brief in `bitbaum/projects/<slug>.md`.

---

## Open source adoption

Before writing new code:

1. Search for OSS with compatible license.
2. If found: fork/adopt, document upstream, improve from first principles (SSOT, tests, deploy).
3. If not: scaffold from site template; import manifest for content.

Never duplicate cron auth, OG image pipelines, or deploy shims — extract to `@fleet/*` when the third copy appears.

---

## Documentation metadata

Every doc under `docs/` includes:

- `created_date` (YYYY-MM-DD)
- `last_modified_date`
- `last_modified_summary`

Update existing docs when behavior changes — do not scatter new READMEs.
