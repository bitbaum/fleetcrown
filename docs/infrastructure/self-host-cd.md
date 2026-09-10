# Continuous deployment for self-hosted apps

Every app on bitbaum deploys through **one** pipeline:
`.github/workflows/selfhost-deploy.yml` in this repo, called by a small shim in
each app repo.

## Why it exists

Before this, `scripts/hetzner/install-push-deploy.sh` installed a **local
pre-push hook** — so a deploy only happened when someone pushed *from the
laptop that had the hook*. Anything merged on GitHub (which is how PRs land)
never reached the box. That is how `aoz-housing` sat with merged fixes and a
five-month-old production build: CI was green, main was correct, and nothing
had ever shipped it.

The hook is still useful for iterating from the laptop. It is no longer the
only path to production.

## The pipeline

```
push to default branch
  └─ wait for that commit's CI to go green         ci-gate.sh (red → blocked)
     └─ pull the app's runtime .env from the box    box stays the env SSOT
        └─ install (npm/pnpm, per lockfile) + build
           + rsync + atomic swap                    deploy.sh
           └─ localhost health check                deploy.sh (auto-rollback)
              └─ public https check                 through Caddy/TLS/DNS
```

Two properties worth keeping:

- **The box owns prod env.** The runner pulls `/opt/<app>/shared/.env` (or the
  legacy `/opt/<app>/app/.env`) over SSH at deploy time. Prod secrets are not
  copied into a dozen GitHub secret stores, and changing one is a single
  box-side edit.
- **A missing deploy key fails the job.** It does not "skip with a notice" — a
  deploy that quietly does nothing while reporting green is the failure this
  pipeline was built to end.

## Adding an app

1. Make sure the app has a row in `scripts/hetzner/apps.conf` — that file is the
   SSOT for its port, domain, app directory and database.

2. Add the deploy key to the app repo (one secret, nothing else):

   ```bash
   gh secret set HETZNER_SSH_PRIVATE_KEY -R bitbaum/<repo> < ~/.ssh/fleetcrown_ci_deploy
   ```

3. Commit this shim to the app repo as `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy

   on:
     push:
       branches: [main]      # use master where that is the default branch

   jobs:
     deploy:
       uses: bitbaum/fleetcrown/.github/workflows/selfhost-deploy.yml@main
       with:
         app: <apps.conf key>
       secrets:
         HETZNER_SSH_PRIVATE_KEY: ${{ secrets.HETZNER_SSH_PRIVATE_KEY }}
   ```

   Use an explicit secret mapping (not `secrets: inherit`). Inherit only works
   inside the same GitHub org; kickoff repos under a personal account
   (e.g. `catomean/…`) calling `bitbaum/fleetcrown` would otherwise fail with
   "Secret HETZNER_SSH_PRIVATE_KEY is required, but not provided while calling."

   Optional inputs: `node-version` (fallback `24` when the repo has no
   `.nvmrc`), `install-flags` (e.g. `--legacy-peer-deps`), and
   `package-manager` to override lockfile detection (`npm | pnpm | yarn`).

The app repo's name and the `apps.conf` key often differ — `revamp-info` on the
box is served from the `hirnli` repo, `datacat-web` from `datacat`. The shim's
`app:` value is always the **apps.conf key**.

## When a deploy fails

| Symptom | Meaning |
|---|---|
| `CI is not green for <sha> — deploy blocked` | Working as designed. Fix CI; the next push deploys. |
| `commit superseded` (job succeeds, nothing deployed) | A newer push is already deploying. Expected. |
| `no runtime .env found on the box` | The app has never been deployed, or `/opt/<app>` was renamed. |
| `DEPLOY UNHEALTHY — rolling back` | The new release failed its health check; prod is back on the previous release. Read `journalctl -u <app>-app -n 50`. |
| `https://<domain> returned <code> after the deploy` | The service is up but the public path is not — look at Caddy, not the app. |

## FleetCrown kickoff (existing repo → CD)

`scripts/hetzner/new-site.sh` scaffolds a **new** site from `scripts/site-template`.
FleetCrown **Make it happen** creates a different kind of repo (agent starters via
`/api/projects/[id]/provision`). To put that repo on the same CD path:

1. Kickoff calls `POST /api/projects/[id]/register-cd` after provision.
2. That seeds `.github/workflows/deploy.yml` (when missing) and, on the studio
   box (register script + deploy key present, eligible account), runs:

   ```bash
   bash scripts/hetzner/register-site.sh <slug> --repo <owner>/<name> --title '…'
   ```

3. On success it writes `user_projects.live_url` and the `production_url` attr.
   When auto-register cannot run, the API returns that same command as the
   single next step — never a fake "site ready" with no URL.

`register-site.sh` is the CD half of `new-site.sh` without scaffolding: apps.conf
row, deploy secret, sync-infra. Prefer it over a parallel host.

## Auto-register on the studio box

`POST /api/projects/[id]/register-cd` (also called from **Make it happen** after
provision) runs `scripts/hetzner/register-site.sh` **in-process** when all of:

1. **Eligible account** — `users.is_default` or `FLEETCROWN_CLOUD_BUILDER_USER_IDS`
   (same gate as shared cloud builder; studio CD is not multi-tenant).
2. **Script present** — resolved in order: `FLEETCROWN_REGISTER_SITE_SCRIPT`,
   `$FLEETCROWN_REPO_ROOT/scripts/hetzner/register-site.sh`,
   `$FLEETCROWN_BOX_DEV_ROOT/fleetcrown/...` (default durable root
   `/home/ubuntu/dev` on the box), `process.cwd()/scripts/...`, then
   `/opt/fleetcrown/app/scripts/hetzner/register-site.sh`.
3. **Deploy key readable** — `DEPLOY_KEY_PATH` or
   `/home/ubuntu/.ssh/fleetcrown_ci_deploy` (the same key `new-site.sh` pipes
   into `gh secret set HETZNER_SSH_PRIVATE_KEY`). The production app runs as
   `User=ubuntu`; a key that only exists on a laptop will make auto-register
   return command-only with an explicit **missing-key** reason.
4. **Not disabled** — unset `FLEETCROWN_SITE_CD_AUTO` (or anything other than
   `0`).

When any gate fails, the API returns `command` **and** `reason` / `gate` — the
kickoff UI must show the reason (not only the bash line). Use **Register site**
on the project header to retry (`register-cd` is idempotent once `liveUrl` is
set).

### One-time box setup (Cato / fleetcrown.orangecat.ch)

```bash
# On the studio box, as ubuntu — durable checkout + deploy key
test -f /home/ubuntu/dev/fleetcrown/scripts/hetzner/apps.conf
install -m 600 /path/to/fleetcrown_ci_deploy /home/ubuntu/.ssh/fleetcrown_ci_deploy

# Optional explicit env in /opt/fleetcrown/app/.env (EnvironmentFile):
# FLEETCROWN_REPO_ROOT=/home/ubuntu/dev/fleetcrown
# FLEETCROWN_BOX_DEV_ROOT=/home/ubuntu/dev
# DEPLOY_KEY_PATH=/home/ubuntu/.ssh/fleetcrown_ci_deploy
```

Keep `/home/ubuntu/dev/fleetcrown` on `main` so `apps.conf` edits survive the
next `/opt/fleetcrown/app` release swap. `liveUrl` is written only after
`register-site.sh` exits 0 — never faked.
