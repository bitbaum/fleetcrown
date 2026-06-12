# Exit Vercel — everything on the Hetzner box (2026-06-12)

Trigger: Vercel team `orangecat` was blocked for fair-use overage. All hosted
prods (fleetcrown.vercel.app, www.orangecat.ch, revampit.vercel.app) served
402 DEPLOYMENT_DISABLED and `vercel --prod` was rejected. Decision: self-host
all three Next.js apps on the existing `bitbaum` box.

## Box layout (bitbaum · 167.233.22.31 · Ubuntu 26.04 · 4 GB)

| Service              | Port | Path                  | Domain                     |
|----------------------|------|-----------------------|----------------------------|
| fleetcrown-bridge    | 4001 | /opt/fleetcrown/bridge| bridge.orangecat.ch        |
| fleetcrown-app       | 4002 | /opt/fleetcrown/app   | fleetcrown.orangecat.ch    |
| orangecat-app        | 4003 | /opt/orangecat/app    | orangecat.ch, www          |
| revampit-app         | 4004 | /opt/revampit/app     | revampit.orangecat.ch      |
| Postgres 17          | 5432 | —                     | (fleetcrown DB lives here) |
| Caddy (auto-TLS)     | 443  | /etc/caddy/Caddyfile  | all of the above           |

Each app dir holds a Next standalone build + `.env` (chmod 600, box-owned,
never overwritten by deploys) + `launch.sh`. systemd units run as `ubuntu`,
Restart=on-failure.

## Deploys

- **FleetCrown**: `bash scripts/deploy-hetzner.sh` (build + rsync + restart).
- **OrangeCat**: build with `SELF_HOST=1` (enables `output: "standalone"` —
  added 2026-06-12, Vercel-incompatible hence opt-in) and env from
  `.env.selfhost.local` (filtered `vercel env pull`, gitignored), stage
  `.next/static`+`public`+`content` into the standalone dir, rsync to
  `/opt/orangecat/app/`, restart `orangecat-app`.
- **Revampit**: same, already had standalone output. Env retargeted from
  revampit.vercel.app → revampit.orangecat.ch during the cutover.

DB story: FleetCrown's Postgres is local on the box (unchanged). OrangeCat
uses hosted Supabase, revampit uses hosted Neon — only the app servers moved.

## DNS (Infomaniak — manual, see cutover checklist)

```
fleetcrown  A  167.233.22.31   (new)
revampit    A  167.233.22.31   (new)
@           A  167.233.22.31   (was Vercel)
www         A  167.233.22.31   (was Vercel — or CNAME to @)
```

Caddy vhosts are already configured; certs issue automatically on first
resolvable request (ACME needs the DNS records to exist).

## Loose ends after cutover

- GitHub OAuth app (client `Ov23liLqwon6cpjr94Fa`, shared box/Vercel) callback
  must change to `https://fleetcrown.orangecat.ch/api/auth/callback/github`.
  Email/password sign-in is unaffected.
- Fleet Runner ≤ v0.6 loads the dead vercel.app domain — code now points to
  fleetcrown.orangecat.ch; needs a v0.7 tag-and-mirror release.
- revampit env carried a tunnel URL for MEDUSA_BACKEND_URL
  (trycloudflare.com — ephemeral, was already dead on Vercel too).
- Once stable: delete the Vercel projects (fleetcrown, orangecat, revampit)
  or let the blocked team rot; nothing references *.vercel.app anymore.
- fleetcrown.vercel.app and revampit.vercel.app are Vercel-owned names — they
  are simply gone; no redirect is possible without Vercel.
