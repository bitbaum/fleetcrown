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
        └─ npm ci + build + rsync + atomic swap     deploy.sh
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
   gh secret set HETZNER_SSH_PRIVATE_KEY -R maonakamoto/<repo> < ~/.ssh/fleetcrown_ci_deploy
   ```

3. Commit this shim to the app repo as `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy

   on:
     push:
       branches: [main]      # use master where that is the default branch

   jobs:
     deploy:
       uses: maonakamoto/fleetcrown/.github/workflows/selfhost-deploy.yml@main
       with:
         app: <apps.conf key>
       secrets: inherit
   ```

   Optional inputs: `node-version` (default `20`) and `install-flags` (e.g.
   `--legacy-peer-deps`).

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
