# Box monitoring & alerts (bitbaum)

Push-based, near-zero-RAM. No Grafana/Prometheus — a solo operator needs
**alerts** (something happened, act now), not dashboards nobody watches at 04:00.
All alerts flow through the watchdog's Telegram channel (`/opt/monitoring/telegram.env`).

## What alerts you

| Signal | Mechanism | Installed by |
|---|---|---|
| Any `*-app` / `appcron-*` unit fails | systemd `OnFailure=notify-failure@%n` → Telegram with journal tail | `install-host-alerts.sh` + encoded in `sync-infra.sh` / `install-app-crons.sh` templates |
| Disk >85% · mem<400MB & swap>90% · failed units present · postgres down | `host-check.sh` on a 5-min timer, transition-only | `install-host-alerts.sh` |
| Any app URL down (4xx/5xx/unreachable) | `watch.sh` on a timer, transition-only | `install-watchdog.sh` |
| The box itself dies | external dead-man's-switch ping in `watch.sh` | `install-watchdog.sh` |
| A bigger Hetzner tier (cx43/cx53) opens for rescale in fsn1 | `hcloud-availability.sh` polls the API's `available_for_migration` on a 10-min timer, transition-only | `install-hcloud-watch.sh` |

Transition-only = you're pinged on the up→down and down→up edges, never every tick.

The rescale watcher exists because Falkenstein is capacity-blocked: the Hetzner
console *lists* cx43/cx53 as valid rescale targets ("supported"), but the API's
`available_for_migration` is empty, so a rescale actually fails. The watcher
polls the real signal and pings the moment a window opens — they can be brief.
Needs a read-only API token in `/opt/monitoring/hcloud.env`.

## Resource guards

- Every `*-app` unit has `MemoryMax=1G` / `MemoryHigh=768M`: a leaking/runaway
  Next process is OOM-killed and restarted alone, never taking the box down.
  (Encoded in `sync-infra.sh`; a re-sync applies it to new apps.)

## Re-apply after adding an app or cron

```bash
bash scripts/hetzner/sync-infra.sh <app>        # unit gets OnFailure + MemoryMax
bash scripts/hetzner/install-app-crons.sh       # cron units get OnFailure
bash scripts/hetzner/install-host-alerts.sh     # (re)wire drop-ins for anything pre-existing
```

## If you ever DO want dashboards

Extend FleetCrown's own `/system` page (already shows disk/mem/uptime) rather
than installing a monitoring stack — same data, zero extra RAM, and it dogfoods
the product. Grafana would cost 400–700MB on a box that runs at ~300MB free.
