# Cloud vs Local Workflows

---
created_date: 2026-05-21
last_modified_date: 2026-06-16
last_modified_summary: Retire the bash daemon onboarding path (killed 2026-06-11). Fleet Runner desktop is now the sole local executor; removed install commands for deleted scripts.
---

FleetCrown is a **hybrid** product: the hosted web app (cloud control plane) owns auth, the database, and the UI; your machine (local runtime) executes agents, git, calendar, and terminal injection.

This document is the SSOT for onboarding and support — keep it aligned with the runtime presence banner, the `/download` page, and `isRuntimeAvailable()`.

> **The local executor is Fleet Runner desktop** (Electron app, signed installer per platform). The old bash daemon (`fleetcrown-daemon.sh` + the Python beacon stack) was retired on 2026-06-11 — see `content/thoughts/killing-the-bash-daemon.md`. There is no bash, no Python beacon, and no `fleetcrown-daemon.service` anymore. Wherever this doc says "daemon" historically, the current equivalent is Fleet Runner.

## Quick start for new users

| Step | Where | Install required? |
|------|-------|-----------------|
| 1. Sign in (GitHub OAuth or email) | Browser | No |
| 2. Onboarding — username, optional first project, connect machine | Browser | No (runtime step skippable) |
| 3. Use goals, projects metadata, prompts library, settings | Browser | No |
| 4. Dispatch agents from Control | Browser + **Fleet Runner** | Yes — download from `/download` |

### Local setup (agent dispatch only)

1. **[Zellij](https://zellij.dev/)** — terminal multiplexer; Fleet Runner injects prompts into tabs. (Bundled with Fleet Runner.)
2. **At least one agent CLI** on `$PATH` — not all of them:
   - Claude Code (`claude`)
   - Cursor Agent (`agent` — [install](https://cursor.com/docs/cli))
   - Codex (`codex`)
   - Gemini CLI (`gemini`)
   - Grok CLI (`grok` — [x.ai/cli](https://x.ai/cli))
   - openclaw
3. **Agent token** — Settings → Agent tokens → Generate.
4. **Download and connect Fleet Runner:**
   - Get the signed installer for your platform from [`/download`](https://fleetcrown.orangecat.ch/download).
   - Launch it and paste your agent token (or sign in) to bind this machine to your account.
   - Config is written to `~/.config/fleetcrown/daemon.env` (legacy path: `~/.config/cockpit/daemon.env`).

Until Fleet Runner connects, Control **queues** dispatches and runs them when the runner long-polls in.

### Reliability

Fleet Runner embeds the `home/` orchestration library (`watcher.ts` + `worker.ts`) and owns execution end-to-end:

| Mechanism | What it does |
|-----------|----------------|
| **Long-poll claim** | Runner claims pending commands via `SELECT … FOR UPDATE SKIP LOCKED` so two runners never grab the same job |
| **Idempotent replay** | On restart the worker replays the JSONL log to rebuild which `runId`s already started; it refuses to double-fire |
| **Append-only event log** | `~/.fleetcrown/events.jsonl` is the single source of truth for crash recovery |
| **Connection-based presence** | Runner online/offline is the live bridge SSE connection, not a heartbeat (see `runner_presence`) |
| **Auto-continue pause sentinel** | `/tmp/fleetcrown-auto-continue-<tab>` — respected by the runner's autopilot path |

## Component roles (Fleet Runner vs web app)

| Component | Runs where | Responsibility |
|-----------|------------|----------------|
| **Web app** | Hosted (self-hosted on the Hetzner box) or local (`fleetcrown-app.service` on `:3000`) | Auth, Postgres, Control UI, command queue, dispatch gates |
| **Fleet Runner** | Your machine (Electron desktop app) | Long-polls the command queue, injects into Zellij, pushes runtime snapshots, embeds the `home/` watcher + worker, autopilot |
| **`home/` library** | Embedded inside Fleet Runner | Local JSONL event loop (`watcher.ts`, `worker.ts`, `decide.ts`, `state.ts`); see `home/README.md` |

**Production control flow:** Browser → API → Postgres queue → Fleet Runner → Zellij → agent CLI.

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

### Requires local runtime (`RUNTIME_AVAILABLE=true` + Fleet Runner)

| Workflow | Local dependency |
|----------|------------------|
| Agent dispatch (Control) | Fleet Runner + Zellij + agent CLI |
| Live Zellij tab list on Control (cloud) | Fleet Runner pushes `openTabs` → `runtime_snapshots` table |
| Claude orchestration (cloud queues; runner injects) | Same |
| Codex / Gemini / OpenClaw orchestration | Local runtime only (503 in cloud) |
| Bootstrap with AI, AI brief | Local `claude` CLI |
| Git sync / commit from Control | Local git |
| Calendar (Today) | Local `gog` |
| GitHub CI on Projects | Local `gh` |
| System stats (mem/disk/uptime) | Local shell |
| Voice transcription (default) | Fleet Runner + ffmpeg + Whisper; or Groq in cloud |
| Run cron job now | Local openclaw |
| Auto-continue pause from web (cloud) | Queued `auto_continue` command → runner writes `/tmp` sentinel |
| Push notifications (agent ready) | Browser subscribe + VAPID on server; `/api/push/notify` |

### Environment-gated (optional features)

| Feature | Env vars |
|---------|----------|
| Email verification / password reset | `RESEND_API_KEY` |
| Ivy / strategist Groq fallback | `GROQ_API_KEY` |
| Stripe billing | `STRIPE_*` |
| Cron Telegram delivery | `TELEGRAM_CHAT_ID` (optional; jobs save without it) |
| Private zone PIN | `PRIVATE_ZONE_PIN_HASH` |
| Scheduled cron janitors (run on the box) | `CRON_SECRET` |
| Web Push (agent-ready notifications) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |

## Architecture sketch

```
 Browser (fleetcrown.orangecat.ch or localhost:3000)
   │  auth, DB, UI, command queue, dispatch gates
   ▼
 PostgreSQL (pending_commands, runtime_snapshots, runner_presence, …)
   ▲
   │  long-poll claim (SKIP LOCKED) + push runtime state
 Fleet Runner desktop  (embeds home/ watcher + worker)
   │  inject → Zellij tabs → agent CLIs
   ▼
 Your projects on disk
```

## Related docs

- `CLAUDE.md` — engineering conventions
- `docs/infrastructure/postgres-portability.md` — vendor-neutral DB env vars, dump/restore, future Oracle/Hetzner migration
- [The Database Kill Switch](/thoughts/the-database-kill-switch-neon-oracle-and-the-studio-stack) — postmortem, egress, Neon vs Oracle vs Hetzner
- `home/README.md` — the local Bridge + Worker library embedded in Fleet Runner (the standalone Brain on `:3001` was retired)
- `docs/debt-reduction-roadmap.md` — orchestration consolidation plan
