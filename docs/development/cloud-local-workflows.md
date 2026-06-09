# Cloud vs Local Workflows

---
created_date: 2026-05-21
last_modified_date: 2026-06-09
last_modified_summary: Clarify beacon vs daemon vs web app roles; fix install script names; document autopilot gate alignment and per-project mode resolution.
---

FleetCrown is a **hybrid** product: the hosted web app (cloud control plane) owns auth, the database, and the UI; your machine (local runtime) executes agents, git, calendar, and terminal injection.

This document is the SSOT for onboarding and support — keep it aligned with `DaemonStatusBanner`, the hosted agent installer, and `isRuntimeAvailable()`.

## Quick start for new users

| Step | Where | Install required? |
|------|-------|-----------------|
| 1. Sign in (GitHub OAuth or email) | Browser | No |
| 2. Onboarding — username, optional first project, connect machine | Browser | No (runtime step skippable) |
| 3. Use goals, projects metadata, prompts library, settings | Browser | No |
| 4. Dispatch agents from Control | Browser + **local setup** | Yes — onboarding step 3 or Settings |

### Local setup (agent dispatch only)

1. **[Zellij](https://zellij.dev/)** — terminal multiplexer; FleetCrown injects prompts into tabs.
2. **At least one agent CLI** on `$PATH` — not all of them:
   - Claude Code (`claude`)
   - Cursor Agent (`agent` — [install](https://cursor.com/docs/cli))
   - Codex (`codex`)
   - Gemini CLI (`gemini`)
   - Grok CLI (`grok` — [x.ai/cli](https://x.ai/cli))
   - openclaw
3. **Agent token** — Settings → Agent tokens → Generate.
4. **Connect your machine:**
   ```bash
   curl -fsSL https://fleetcrown.vercel.app/api/agent/install | node - init --base-url https://fleetcrown.vercel.app
   # or after generating a token:
   curl -fsSL https://fleetcrown.vercel.app/api/agent/install | node - init --token ck_... --base-url https://fleetcrown.vercel.app
   ```
   Config is written to `~/.config/fleetcrown/daemon.env` (legacy: `~/.config/cockpit/daemon.env`).
5. **Install and start the daemon (recommended — systemd user service):**
   ```bash
   bash scripts/install-fleetcrown-daemon.sh
   # after code changes:
   bash scripts/install-fleetcrown-daemon.sh --restart
   ```
   Also install beacon hooks and the pre-warmed popup window:
   ```bash
   bash scripts/install-beacon.sh
   bash scripts/install-fleetcrown-beacon-window.sh
   ```
   The service uses `Restart=always`, a singleton file lock (one instance only), push-loop self-healing, and automatic reclaim of stale queued commands after daemon crashes.

Until the daemon connects, Control **queues** dispatches and runs them when the daemon pings in.

### Daemon reliability (2026-05-30)

| Mechanism | What it fixes |
|-----------|----------------|
| **systemd `Restart=always`** | Daemon comes back after crash, OOM, or self-heal exit |
| **Singleton flock lock** | No duplicate daemons fighting over Zellij / queue |
| **Push-loop supervisor** | Background state pusher restarts if its subshell dies |
| **Push failure budget** | After 30 consecutive failed runtime pushes, daemon exits cleanly so systemd restarts it |
| **Stale command reclaim** | Commands claimed but never finished (mid-restart) become pending again after 90s |
| **Autopilot Stop hook** | On agent stop, loads `~/.config/cockpit/daemon.env` so dispatch hits production (not localhost) with your daemon token; autopilot runs before any other stop-hook step |
| **Autopilot watchdog** | Daemon push loop fires next_best when (a) fresh `agent-ready-<tab>` exists, or (b) session handoff has `status: ready` within 120s — covers Cursor/Codex without Stop hooks |
| **Inject via daemon queue** | Autopilot queues `/api/inject` with bearer token; daemon executes Zellij inject reliably (direct hook inject was failing silently) |
| **`install-fleetcrown-daemon.sh --restart`** | Stop service, kill orphans, sync beacon hooks, start fresh — use after pulling daemon changes |
| **Per-project autopilot override** | `GET /api/beacon-settings?project=<tab>` returns `effective_mode` (project override → user default) for stop-hook gating |
| **Auto-continue pause sentinel** | `/tmp/fleetcrown-auto-continue-<tab>` — respected by stop hook, notification hook, and daemon |

**Logs:** `journalctl --user -u fleetcrown-daemon -f`  
**Status:** `systemctl --user status fleetcrown-daemon`

## Component roles (beacon vs daemon vs web app)

| Component | Runs where | Responsibility |
|-----------|------------|----------------|
| **Web app** | Cloud (Vercel) or local (`fleetcrown-app.service` on `:3000`) | Auth, Postgres, Control UI, command queue, dispatch gates, beacon popup UI |
| **Daemon** | Your machine (`fleetcrown-daemon.service`) | Polls command queue, injects into Zellij, pushes runtime snapshots, autopilot watchdog |
| **Beacon** | Your machine (hooks + optional Chromium window) | On agent **stop**: opens `/beacon/live` popup, waits for user/countdown choice, injects via same API path as Control |
| **`home/` stack** | Your machine (`:3001`, experimental) | Local JSONL event loop — separate from production path; see `home/README.md` |

**Production control flow:** Browser → API → Postgres queue → daemon → Zellij → agent CLI. Beacon is a *local launcher* for the popup UI, not a second control plane.

## Workflow matrix

### Works in browser only (no local install)

| Workflow | Notes |
|----------|-------|
| Sign-in, onboarding, profile, team invites | GitHub repo picker needs GitHub OAuth |
| Goals, commitments, captures, prompts browse | Full CRUD |
| Projects (metadata, inline edit) | No live git/CI without local runtime |
| Weather (Today) | Open-Meteo on cloud |
| Ask Ivy | Needs `GROQ_API_KEY` and/or local openclaw |
| Agent token minting | Settings creates the token; the hosted installer connects your machine |
| Schedule prompt job (Prompts → Schedule) | Stored in Postgres per user; **execution** still needs local openclaw |
| Private zone (People, Money, Habits, Events) | PIN enforced server-side when `PRIVATE_ZONE_PIN_HASH` is set |

### Requires local runtime (`RUNTIME_AVAILABLE=true` + daemon)

| Workflow | Local dependency |
|----------|------------------|
| Agent dispatch (Control) | Daemon + Zellij + agent CLI |
| Live Zellij tab list on Control (cloud) | Daemon pushes `openTabs` → `runtime_snapshots` table |
| Claude orchestration (cloud queues; daemon injects) | Same |
| Codex / Gemini / OpenClaw orchestration | Local runtime only (503 in cloud) |
| Bootstrap with AI, AI brief | Local `claude` CLI |
| Git sync / commit from Control | Local git |
| Calendar (Today) | Local `gog` |
| GitHub CI on Projects | Local `gh` |
| System stats (mem/disk/uptime) | Local shell |
| Beacon window show/hide | xdotool + local Chromium service |
| Voice transcription (default) | Daemon + ffmpeg + Whisper; or Groq in cloud |
| Run cron job now | Local openclaw |
| Auto-continue pause from web (cloud) | Queued `auto_continue` command → daemon writes `/tmp` sentinel |
| Push notifications (agent ready) | Browser subscribe + VAPID on server; Stop hook calls `/api/push/notify` |

### Environment-gated (optional features)

| Feature | Env vars |
|---------|----------|
| Email verification / password reset | `RESEND_API_KEY` |
| Ivy / strategist Groq fallback | `GROQ_API_KEY` |
| Stripe billing | `STRIPE_*` |
| Cron Telegram delivery | `TELEGRAM_CHAT_ID` (optional; jobs save without it) |
| Private zone PIN | `PRIVATE_ZONE_PIN_HASH` |
| Vercel cron janitors | `CRON_SECRET` |
| Web Push (agent-ready notifications) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |

## Architecture sketch

```
 Browser (fleetcrown.vercel.app or localhost:3000)
   │  auth, DB, UI, command queue, dispatch gates
   ▼
 PostgreSQL (pending_commands, runtime_snapshots, beacon_sessions, …)
   ▲
   │  poll + push runtime state
 Local daemon (fleetcrown-daemon.sh)
   │  inject → Zellij tabs → agent CLIs
   ▲
   │  stop hook → beacon.py → /beacon/live popup → choice → /api/inject
 Agent Stop hooks (agent-hook-bridge.sh)
   ▼
 Your projects on disk
```

## Related docs

- `CLAUDE.md` — engineering conventions
- `docs/infrastructure/postgres-portability.md` — vendor-neutral DB env vars, dump/restore, future Oracle/Hetzner migration
- [The Database Kill Switch](/thoughts/the-database-kill-switch-neon-oracle-and-the-studio-stack) — postmortem, egress, Neon vs Oracle vs Hetzner
- `home/README.md` — experimental local Brain+Bridge+Worker stack (`:3001`), separate from SaaS default path
- `docs/debt-reduction-roadmap.md` — orchestration consolidation plan
