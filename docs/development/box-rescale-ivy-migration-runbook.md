# Ivy/OpenClaw → Hetzner co-location runbook

**Goal:** get Ivy (the OpenClaw assistant) onto the always-on Hetzner box so it
survives the laptop closing.

**Decision (2026-06-16):** **co-locate** Ivy on the existing box (now CX43,
16 GB) rather than buy a separate box. The box rescale removed the resource
objection (12 GB free, 0 swap); the two remaining concerns are mitigated cheaply
in-place:
- **Independence/alerting** → the watchdog's off-box `HEARTBEAT_URL` + the
  dedicated Telegram bot mean box-death still pages you even with Ivy co-located.
- **Security blast radius** (an autonomous agent with broad creds beside 12
  client DBs) → run OpenClaw as a **non-root user** + lock `pg_hba.conf` so it
  can't reach the client DBs + bind the gateway/portal to **loopback**.

**Revisit a dedicated Ivy box only when client-data isolation becomes a *hard*
requirement** (e.g., at incorporation / signing client DPAs) — then "an agent
shares a host with client databases" is a real audit finding. Park it; not a
now-decision.

Lanes: Step 0 is box-wide infra (devops pane). Steps 1–2 are the Ivy migration
(use `scripts/migrate-openclaw.sh`). Step 2 (watchdog) is already built.

---

## Step 0 — Off-box backups (PREREQUISITE, still open)

The #1 data-loss risk: nightly dumps currently live on the same disk as the DBs.

- [ ] Create a Hetzner **Storage Box** (Console → Storage Boxes → smallest, ~CHF 4/mo).
- [ ] Drop `/opt/backups/restic.env` on the box (the backup installer printed the contents) → off-box snapshots activate automatically.
- [ ] **Run + verify one restore** (a backup you haven't restored is a hope):
  ```
  /opt/backups/pg-backup.sh
  createdb restore_test && pg_restore -d restore_test /opt/backups/pg/<latest-fleetcrown>.dump && psql restore_test -c '\dt' && dropdb restore_test
  ```

---

## ✓ Rescale — DONE

CX22 → **CX43** (8 vCPU / 16 GB) completed 2026-06-16. Verified: 15 GB total,
10 GB free, **0 swap**, no failed services, site 200. No action remaining.

> (Separate note, not gating Ivy: the box was swapping pre-rescale; it's healthy
> now. If app count grows, re-evaluate — but that's its own decision.)

---

## Step 1 — Migrate Ivy / OpenClaw onto the box (co-located, hardened)

Source: `~/.openclaw/` on the laptop (~2.2 GB; `workspace/` 1.3 GB,
`messages.sqlite` 20 MB, `knowledge.sqlite` 140 KB = the memory). The
`scripts/migrate-openclaw.sh` helper automates the mechanical parts (stop →
package → transfer → restore → perms) and stops at the judgment gates below.

### 1.1 Prepare the box
- [ ] **Non-root run user** (blast-radius isolation): `useradd -m -s /bin/bash openclaw` (decide: dedicated `openclaw` user vs existing `g` — dedicated is safer).
- [ ] Node 22 (the laptop runs v22.22.0 via nvm) + `git sqlite3 ffmpeg`.
- [ ] Install OpenClaw the same way as the laptop: `npm i -g openclaw@2026.4.23` (confirm it resolves on the box; if it's a private/git install, replicate that source).
- [ ] **`pg_hba.conf` lockdown** (security): confirm the `openclaw` OS user CANNOT connect to the client databases. With `peer`/`ident` for local socket, the `openclaw` user maps to a Postgres role — ensure that role has **no access** to fleetcrown/orangecat/client DBs (it should own nothing, or not exist). Test: `sudo -u openclaw psql -l` and `sudo -u openclaw psql kivvi -c '\dt'` should be **denied**.

### 1.2 Package + transfer (laptop)  — `scripts/migrate-openclaw.sh package`
- Stops the laptop gateway FIRST (avoids two gateways → Telegram/WhatsApp session collision/ban), tars `~/.openclaw` excluding `.venv-stt`/`.venvs`/`browser`/`cache`/`node_modules`/`__pycache__`, rsyncs the archive **and this script** to the box `/tmp/`.

### 1.3 Restore (box, as the run user)  — `migrate-openclaw.sh restore`
- Extracts into `$HOME/.openclaw/`, `chmod 600 .env`, `chmod 700 credentials/`. Then the guided steps:
- [ ] Rebuild python venvs per OpenClaw's setup (the script prints where; confirm STT routes to an **API**, not local — local STT is the heavy path).
- [ ] **Bind to loopback** + install the service:
  ```
  openclaw gateway install --bind loopback     # creates the systemd unit, loopback-only
  openclaw gateway start
  openclaw gateway status                       # verify
  ```
- [ ] Portal (:18790) stays **localhost-only** — reach it via Tailscale (install on the box) or `ssh -N -L 18790:localhost:18790 root@167.233.22.31`. Confirm no Caddy vhost exposes it.

### 1.4 WhatsApp re-pair (expect this)
- [ ] Telegram migrates via its token. **WhatsApp-Web sessions are device-bound** — assume you re-scan the QR from the box's portal. Never run both ends at once (laptop gateway must stay stopped — `openclaw gateway status` on the laptop).

### 1.5 Cutover verification
- [ ] Laptop gateway **stopped**; box gateway **active**; message Ivy on Telegram → she answers from the box.
- [ ] Daily-brief crons present on the box (`~/.openclaw/cron/`).

### 1.6 Back up Ivy's brain
- [ ] Add `~openclaw/.openclaw/{knowledge,messages}.sqlite` + `credentials/` + `.env` to the off-box backup (extend `/opt/backups/pg-backup.sh` or a sibling) — pg-backup covers Postgres only. Without this, a box loss = Ivy with amnesia.

---

## Step 2 — Watchdog alerts (built; activate — this is what makes co-location safe)

- [ ] Dedicated Telegram bot via @BotFather (**NOT** Ivy's bot — the alert channel must be independent of the box it watches). Token + chat id → `/opt/monitoring/telegram.env`.
- [ ] **`HEARTBEAT_URL`** (free healthchecks.io) in `telegram.env` → catches **box-death**, which a box-local watchdog can't self-report. This is the mitigation that makes co-locating Ivy acceptable.
- [ ] After Step 1, watch Ivy too: append `ivy|http://localhost:18790/<health-path>|200` to `/opt/monitoring/targets.conf` (loopback works — the watchdog runs on the box).
- [ ] Live test: flip a target → confirm 🔴 DOWN / ✅ RECOVERED reach your phone.

---

## One-glance sequence
0. **Off-box backups + restore drill** (devops pane) — still open, #1 risk.
1. **Migrate OpenClaw/Ivy onto the box** — non-root user, `pg_hba` lockdown, `gateway install --bind loopback`, re-pair WhatsApp, back up its sqlite. Helper: `scripts/migrate-openclaw.sh`.
2. **Activate watchdog** — dedicated bot + `HEARTBEAT_URL` + add Ivy target.

Co-location is the call *because the box now has the RAM and the two isolation
risks are covered by config + an off-box heartbeat* — not because isolation
stopped mattering. Re-open the dedicated-box question at incorporation.
