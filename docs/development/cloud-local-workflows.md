# Cloud vs Local Workflows

---
created_date: 2026-05-21
last_modified_date: 2026-08-15
last_modified_summary: Web push also fires when a captain-initiated run finishes, not only when an agent is ready.
---

FleetCrown is a **hybrid** product: the hosted web app (cloud control plane) owns auth, the database, and the UI. Agents run via the **builder** — the cloud service on Hetzner (box-runner) and/or the optional desktop app on your computer. Users never need to pick; both share one queue.

User-facing copy lives in `src/config/executor-copy.ts`. Internal docs may still say Fleet Runner / box-runner.

> **Flow completeness:** see [user-flow-audit.md](./user-flow-audit.md) for every UI-implied flow and its A/B/C/D grade (~37% fully work in hosted prod without extra runtime).

> **Fleet Runner desktop** = optional app on your computer. **box-runner** = the same engine headless on Hetzner. Together they are the **builder**.

## Quick start for new users

| Step | Where | Install required? |
|------|-------|-----------------|
| 1. Sign in (GitHub OAuth or email) | Browser | No |
| 2. Onboarding — username, optional first project | Browser | No |
| 3. **Go to Control** — explore, link GitHub repos, press Start building | Browser | No |
| 4. Use goals, projects metadata, prompts library, Loki, settings | Browser | No |
| 5. **Optional:** install desktop app from `/download` | Desktop | Only if you want agents on **this computer's** folders and CLIs |

### Desktop setup (optional — local execution)

Use this when you want agents to run on your machine instead of (or alongside) cloud workers:

1. **Download Fleet Runner** from [`/download`](https://fleetcrown.orangecat.ch/download) — same UI as the website, plus a background executor.
2. **Sign in** with the same FleetCrown account (or paste an agent token from Settings).
3. **Install at least one agent CLI** (Claude, Grok, Codex, Cursor, Gemini, …) — the desktop app can guide you.
4. **Launch at login** (Settings → Startup) so your machine stays connected.

Until a builder is online, Control **queues** dispatches. **Start building** also queues when offline. Git-backed projects can route to the **hosted worker** (Hermes PR mode) when no builder claims the job.

### Cloud builder (box-runner) — always-on on Hetzner

For the product owner account, `fleetcrown-box-runner.service` is the default executor:

- **Enabled on boot**, `Restart=always` — intended to run 24/7 without a laptop.
- **Separate from `fleetcrown-app`** — web deploys restart the site, not agent PTYs; deploy still **syncs + restarts** box-runner code via `scripts/deploy-hetzner.sh`.
- **First install:** `bash scripts/hetzner/install-box-runner.sh`
- Control shows **Cloud builder online** when the bridge connection is live and the runner reports a `box-*` version.

The optional **desktop app** is the same queue on your computer — use both; each job goes to one claimant.

### Reliability

Fleet Runner embeds the `home/` orchestration library (`watcher.ts` + `worker.ts`) and owns execution end-to-end:

| Mechanism | What it does |
|-----------|----------------|
| **Long-poll claim** | Runner claims pending commands via `SELECT … FOR UPDATE SKIP LOCKED` so two runners never grab the same job |
| **Idempotent replay** | On restart the worker replays the JSONL log to rebuild which `runId`s already started; it refuses to double-fire |
| **Append-only event log** | `~/.fleetcrown/events.jsonl` is the single source of truth for crash recovery |
| **Connection-based presence** | Runner online/offline is the live bridge SSE connection, not a heartbeat (see `runner_presence`) |
| **Auto-continue pause sentinel** | `/tmp/fleetcrown-auto-continue-<tab>` — respected by the runner's autopilot path |

## Component roles (builder vs web app)

| Component | Runs where | Responsibility |
|-----------|------------|----------------|
| **Web app** | Hosted Hetzner box (`fleetcrown-app`) or local dev | Auth, Postgres, Control/Loki UI, command queue — **control plane only on prod** (`RUNTIME_AVAILABLE` unset) |
| **box-runner** | Hetzner box (`fleetcrown-box-runner.service`) | Default cloud builder: polls queue, owned PTY agents, peek-stream for Terminal → Cloud |
| **Fleet Runner** | Optional — operator's computer (Electron) | Same queue on local machine; Terminal → This computer |
| **Hermes runner** | Hetzner sandbox | PR-mode offline dispatches when no builder claims |
| **`home/` library** | Embedded in desktop runner | Local JSONL event loop; see `home/README.md` |

**Production control flow:** Browser → API → Postgres queue → box-runner (or desktop) → owned PTY → agent CLI. Terminal → Cloud / This computer are **fully interactive** (xterm keystrokes → `tab-inject-raw` → bridge rawkey → runner PTY); output streams via peek-stream SSE.

Priority stack: `docs/architecture/priority-plan-2026-H2.md`.

## Workflow matrix

### Works in browser only (no local install)

| Workflow | Notes |
|----------|-------|
| Sign-in, onboarding, profile, team invites | GitHub repo picker needs GitHub OAuth |
| Goals, commitments, captures, prompts browse | Full CRUD |
| Projects (metadata, inline edit) | No live git/CI without local runtime |
| Weather (Today) | Open-Meteo on cloud |
| Ask Loki (`/loki`) — chat | Needs `GROQ_API_KEY` and/or local openclaw |
| Ask Loki — **dispatch** ("move forward", "code review for …") | Same builder queue as Control; runs when cloud or desktop builder is online (queues if offline) |
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
| Push notifications (run finished + agent ready) | Browser subscribe + VAPID on server; run-close via `notifyRunClosed`, runner via `/api/push/notify` |
| **Terminal → My machine** (live agent view) | Fleet Runner owns the agent PTY (v0.8.3+); `/terminal` streams it via peek_start → peek-frame → SSE. Requires Fleet Runner v0.8.5+ for reliable peek (no zellij hang on detached sessions). |

### Terminal page (`/terminal`)

Two sources behind one view (toggle **Cloud** | **This computer**):

| Source | Substrate | When to use |
|--------|-----------|-------------|
| **Cloud** | Agent PTYs on Hetzner (box-runner) | Default for web users — Loki and Control dispatches run here when the cloud builder is online |
| **This computer** | Fleet Runner-owned agent PTYs on your laptop | Live view of agents you dispatched locally; same queue as Cloud — only one builder claims each job |

Loki and Control do **not** connect to Terminal directly. They enqueue `pending_commands`; a builder injects into the agent CLI; Terminal is the watch surface (`source=server` or `source=machine`).

**This computer** lists open tabs from the runner heartbeat (`/api/control/open-tabs`) and streams the selected tab via peek APIs. **Cloud** uses server workspaces for the hosted builder.

### Environment-gated (optional features)

| Feature | Env vars |
|---------|----------|
| Email verification / password reset | `RESEND_API_KEY` |
| Ivy / strategist Groq fallback | `GROQ_API_KEY` |
| Stripe billing | `STRIPE_*` |
| Cron Telegram delivery | `TELEGRAM_CHAT_ID` (optional; jobs save without it) |
| Private zone PIN | `PRIVATE_ZONE_PIN_HASH` |
| Scheduled cron janitors (run on the box) | `CRON_SECRET` |
| Web Push (run-finished + agent-ready notifications) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |

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
