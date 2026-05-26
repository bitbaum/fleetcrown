# Cloud vs Local Workflows

---
created_date: 2026-05-21
last_modified_date: 2026-05-26
last_modified_summary: Use the hosted agent installer while the npm package is unpublished.
---

Cockpit is a **hybrid** product: the hosted web app (cloud control plane) owns auth, the database, and the UI; your machine (local runtime) executes agents, git, calendar, and terminal injection.

This document is the SSOT for onboarding and support — keep it aligned with `DaemonStatusBanner`, the hosted agent installer, and `isRuntimeAvailable()`.

## Quick start for new users

| Step | Where | Install required? |
|------|-------|-----------------|
| 1. Sign in (GitHub OAuth or email) | Browser | No |
| 2. Onboarding — username, optional first project, connect machine | Browser | No (runtime step skippable) |
| 3. Use goals, projects metadata, prompts library, settings | Browser | No |
| 4. Dispatch agents from Control | Browser + **local setup** | Yes — onboarding step 3 or Settings |

### Local setup (agent dispatch only)

1. **[Zellij](https://zellij.dev/)** — terminal multiplexer; Cockpit injects prompts into tabs.
2. **At least one agent CLI** on `$PATH` — not all of them:
   - Claude Code (`claude`)
   - Cursor Agent (`agent` — [install](https://cursor.com/docs/cli))
   - Codex (`codex`)
   - Gemini CLI (`gemini`)
   - openclaw
3. **Agent token** — Settings → Agent tokens → Generate.
4. **Connect your machine:**
   ```bash
   curl -fsSL https://cockpitapp.vercel.app/api/agent/install | node - init --base-url https://cockpitapp.vercel.app
   # or after generating a token:
   curl -fsSL https://cockpitapp.vercel.app/api/agent/install | node - init --token ck_... --base-url https://cockpitapp.vercel.app
   ```
   Config is written to `~/.config/cockpit/daemon.env`.
5. **Start the daemon:**
   ```bash
   set -a && source ~/.config/cockpit/daemon.env
   ./scripts/cockpit-daemon.sh
   # optional: bash scripts/install-daemon.sh  (systemd user service)
   ```

Until the daemon connects, Control **queues** dispatches and runs them when the daemon pings in.

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

### Environment-gated (optional features)

| Feature | Env vars |
|---------|----------|
| Email verification / password reset | `RESEND_API_KEY` |
| Ivy / strategist Groq fallback | `GROQ_API_KEY` |
| Stripe billing | `STRIPE_*` |
| Cron Telegram delivery | `TELEGRAM_CHAT_ID` (optional; jobs save without it) |
| Private zone PIN | `PRIVATE_ZONE_PIN_HASH` |
| Vercel cron janitors | `CRON_SECRET` |

## Architecture sketch

```
 Browser (cockpitapp.vercel.app)
   │  auth, DB, UI, command queue
   ▼
 PostgreSQL (pending_commands, cron_jobs, …)
   ▲
   │  poll + push runtime state
 Local daemon (cockpit-daemon.sh)
   │  inject → Zellij tabs → agent CLIs
   ▼
 Your projects on disk
```

## Related docs

- `CLAUDE.md` — engineering conventions
- `docs/infrastructure/postgres-portability.md` — vendor-neutral DB env vars, dump/restore, future Oracle/Hetzner migration
- [The Database Kill Switch](/thoughts/the-database-kill-switch-neon-oracle-and-the-studio-stack) — postmortem, egress, Neon vs Oracle vs Hetzner
- `home/README.md` — experimental local Brain+Bridge+Worker stack (`:3001`), separate from SaaS default path
- `docs/debt-reduction-roadmap.md` — orchestration consolidation plan
