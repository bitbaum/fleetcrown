# FleetCrown — Handoff

**Read this first.** A 5-minute brief on what FleetCrown is, where it stands, what to work on next, and what you'll get wrong if you don't know.

Written 2026-06-07 after a 2-day session that took the product from v0.7.0 (broken bundled-renderer disaster) to v0.7.5 (clean Electron web-shell + adapter architecture + observability + migration ledger). Audience is the next agent or contributor.

> **Infra update (2026-06-12):** FleetCrown left Vercel entirely. The web app and
> Postgres are now **self-hosted on the Hetzner `bitbaum` box** (Caddy + systemd),
> serving at `https://fleetcrown.orangecat.ch`; deploys run via
> `scripts/deploy-hetzner.sh` (build → rsync → restart `fleetcrown-app`). The
> references to Vercel below have been updated to this reality, but read
> `docs/infrastructure/hetzner-migration.md` for the authoritative current layout.

---

## 1. The product in one paragraph

FleetCrown is a multi-user SaaS for builders who run **multiple AI agents across multiple projects in parallel**. The user signs into `fleetcrown.orangecat.ch` (GitHub OAuth), registers their projects, and dispatches prompts to agents (Claude, Codex, Grok, Gemini, Cursor) running locally in Zellij terminals on their machine. The cloud is the **coordination layer**; agents and terminals are pluggable adapters; the daemon (poller + pusher + watcher) runs on the user's machine to close the loop. FleetCrown itself is the customer of sibling product **OrangeCat** (BTC payment/economic layer). Both ship under solo pseudonymous founder **Mao Nakamoto**, pre-revenue, one paying user (himself, dogfooding).

## 2. The lay of the land

| Surface | URL / path | Status |
|---|---|---|
| Cloud web app | `https://fleetcrown.orangecat.ch` | Production, self-hosted on Hetzner (Caddy + systemd), Postgres 17 on the same box |
| SSE bridge | `https://bridge.orangecat.ch` | Production, same Hetzner CX22 (€5/mo total) |
| DB | `postgresql://fleetcrown@postgresqlbridge.orangecat.ch:5432/fleetcrown` | Postgres 17.10, 10 MB used, 39 tables, all healthy |
| Desktop app | `Fleet Runner` (Electron 33) | v0.7.5 latest, ships as .deb / .dmg / .exe / AppImage |
| Releases | `https://github.com/maonakamoto/fleetcrown-releases/releases` | Mirror of build artifacts |
| Source repo | `https://github.com/maonakamoto/fleetcrown` | Public |
| /releases page | `https://fleetcrown.orangecat.ch/releases` | Public changelog (SSOT: `src/config/changelog.ts`) |

## 3. Architecture in one diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ packages/fleetcrown-core (NOT YET EXTRACTED — see §6)           │
│   types, zod contracts, pure domain functions                   │
└─────────────────────────────────────────────────────────────────┘
        ↑ depended on by ↑
┌─────────────────────────────┐  ┌──────────────────────────────┐
│ src/  (Next.js — Hetzner)   │  │ desktop/src/main/  (Electron) │
│   Pages + /api/* routes     │  │   poller / pusher / watcher  │
│   Adapters:                 │  │   IPC bridge (window.fleetRunner) │
│   • lib/agents/<id>.ts      │  │   Adapters re-use src/lib/{agents,terminals} │
│   • lib/terminals/<id>.ts   │  └──────────────────────────────┘
│   • lib/git-state.ts        │            ↑ wraps ↑
│   • Drizzle schemas         │     fleetcrown.orangecat.ch inside Electron
└─────────────────────────────┘
        ↓ NOTIFY pg_notify ↓
┌─────────────────────────────────────────────────────────────────┐
│ bridge.orangecat.ch (Hetzner)                                    │
│   LISTEN 'fc:state' on Postgres                                  │
│   Fan-out: SSE → all signed-in browsers + desktop instances     │
└─────────────────────────────────────────────────────────────────┘
```

**One UI codebase** (the Next.js app). Electron wraps it with native integrations (tray, deep-link auth, IPC for Peek + auto-mint + local-dev-scan). The bundled local renderer in `desktop/src/renderer/` was deleted in v0.7.4 — DO NOT bring it back. That parallel UI was the source of the v0.7.0 disaster.

## 4. The adapter pattern (the strategic move)

FleetCrown doesn't own a model or a terminal multiplexer. It owns the **coordination layer where any model and any terminal plug in**.

### Agents

```
src/lib/agents/
├── types.ts        AgentAdapter interface
├── helpers.ts      commandExistsInPath, parseTomlStringField, dedupeStrings
├── claude.ts       \
├── codex.ts        |
├── grok.ts         |  one file per agent, all behavior in one place:
├── gemini.ts       |  detectAvailable, readConfiguredModel, buildLaunchCommand,
├── cursor.ts       |  syncSelectedModel?, capabilities, processMatchers,
├── openclaw.ts     /  defaultModel, modelSuggestions, quitCommand, installCommand
└── index.ts        ALL_ADAPTERS = [claude, grok, cursor, codex, openclaw, gemini]
                    findAdapter(id), effectiveDefaultModel, effectiveModelSuggestions
```

**Adding a new agent** (Cline, Aider, opencode, whatever): create one new file `src/lib/agents/newagent.ts` exporting `newagentAdapter: AgentAdapter`, add it to `ALL_ADAPTERS` in `index.ts`. **No edits to any other file.** The catalog, the launcher, the availability badge, the install button, the UI dropdowns all read from the adapter automatically.

### Terminals

```
src/lib/terminals/
├── types.ts        TerminalAdapter interface
├── zellij.ts       Full Zellij implementation (only impl today)
└── index.ts        ALL_TERMINALS = [zellijAdapter], findTerminal, activeTerminal
```

`src/lib/zellij.ts` is now a thin compat shim re-exporting historical names — 15 call sites keep working unchanged while migration to direct `@/lib/terminals` imports happens incrementally.

**Adding a new multiplexer** (tmux, screen, browser-shell): same pattern.

### Agent switching (v0.8.0)

Users switch agents without typing quit commands in Zellij:

| Surface | How |
|---|---|
| Project card chip | Click the agent status chip (e.g. "Codex ready") → pick another installed agent |
| Cmd+K palette | `Switch <project> to Cursor` → focuses tab + queues switch |
| Rate-limit banner | Appears when session text matches capacity regex; one-click fallback |
| API | `POST /api/control/switch-agent` — scans `/proc`, quits all running agents in `dir`, launches `toAgent` |

**Detection SSOT:** `src/lib/agent-resolution.ts` (client-safe) + `src/lib/agent-process-scan.ts` (server `/proc`). The UI warns on mismatch when `agentPref` disagrees with `activeAgents`.

**Cloud mode:** switch enqueues `pending_commands` type `switch_agent`; Fleet Runner poller executes locally (improved in v0.8.0 to quit every running agent in the directory).

### What's deferred

A `TransportAdapter` (Hetzner SSE bridge → Cloudflare Durable Objects → WebSocket → ...) and a `StorageAdapter` (Postgres → SQLite local-first → ...) are the next two ports if the user demand pulls us there. **Don't build them speculatively.** Today the self-hosted Hetzner stack handles a 1-user workload trivially.

## 5. The dispatch flow end-to-end

Critical for understanding everything else:

```
User clicks "Send next-best to FleetCrown" on /control (browser or Electron)
  ↓
POST /api/inject  → writes pending_commands row in Postgres
  ↓ AFTER INSERT trigger fc_notify_pending_commands fires pg_notify('fc:state', ...)
  ↓
bridge.orangecat.ch (LISTEN 'fc:state') receives event
  ↓ HTTP/2 SSE fan-out
  ↓
Desktop poller (or bash daemon) receives "wake" signal → calls /api/control/commands?wait=0
  ↓
Server: claimNextPendingCommand (FOR UPDATE SKIP LOCKED) → returns the row
  ↓
Desktop main process: validateCommand (zod) → injectIntoTab(tab, prompt)
  ↓ src/lib/terminals/zellij.ts → withFocusedTab → zellij action write-chars + Enter
  ↓
Zellij tab on user's machine receives keystrokes → Claude/Codex/etc. starts executing
  ↓
On idle, agent writes ~/.claude/sessions/<tab>.md
  ↓
desktop watcher detects file change → appends worker.idle event → pushNow() → POST /api/control/runtime-state
  ↓ INSERT into runtime_snapshots fires fc_notify_runtime_snapshots
  ↓ bridge fans out via SSE
  ↓
Browser /control re-fetches → UI updates within ~200ms of the DB write
```

**Sub-second cloud↔local round-trip** when daemon is connected. This is the v0.6 work; everything else builds on it.

## 6. Status by area, as of 2026-06-07 17:00 UTC

### Production
- ✅ **All systems green**. App deployed on the Hetzner box (`fleetcrown-app` healthy). Hetzner DB 10 MB, 2/100 conns. Bridge SSE running.
- ✅ Latest desktop: **v0.7.5**. Auto-update with explicit fallback banner on .deb.

### What was just done (this session)
14 commits in chronological order — see `/releases` page for human-readable changelog. Highlights:

1. **v0.7.1 → v0.7.5 desktop releases** — reverted broken Phase C bundled-renderer flip, shipped Peek feature, added token-401 auto-recovery, removed bundled renderer entirely, shipped in-app update banner with manual-install command for .deb.
2. **Port 1 — AgentAdapter** (`src/lib/agents/*`). Was: 427-line registry with switch statements + per-agent functions scattered. Now: one file per agent, all behavior in one place.
3. **Port 2 — TerminalAdapter** (`src/lib/terminals/*`). Was: 263 lines of hardcoded `zellij action ...` shellouts. Now: behind an interface; new multiplexers are one new file.
4. **God-route extraction** — `/api/control/route.ts` went from 537 to 407 lines. Extracted `lib/git-state.ts`, `lib/project-profile-match.ts`. Two more sections (lifecycle writeback, response assembly) still inline; not blocking.
5. **DB hygiene** — dropped duplicate `project_states_notify` trigger (was doubling NOTIFY traffic), fixed `/api/event-stream-token` minting a fresh token per request (10 stale tokens piled up in 36h; now reuses up to 7d old + daily cron cleanup at 05:00 UTC), bootstrapped `drizzle.__drizzle_migrations` (was missing — schema arrived via `push`, future migrations were untracked).
6. **Code-quality SSOT batches** — daemon timing constants, token-store, ANSI strip, agent-list derived from registry, zellij focus-dance HOF + `zellijCmd` helper, refresh-delay timing constants, `PHASE_DOT_CLASS` exhaustive map. Total ~50 lines per touched file became ~10.
7. **Observability** — `/api/metrics` endpoint with 6 query aggregations across existing tables (dispatch, runs, errors, tokens, daemon, projects). Zero new deps.
8. **/releases page** — public changelog at `/releases`, sourced from `src/config/changelog.ts`. Footer version pill links to it.
9. **Command palette + projects** — Cmd-K now lists user's projects (was missing).

### What's solid and you shouldn't touch
- The dispatch pipeline (DB NOTIFY → bridge → SSE → UI). It's been hardened over v0.6.
- The schema. 39 tables, FK-clean, drift-free, ledger now exists.
- The AgentAdapter and TerminalAdapter interfaces. Lock them in; they're the SSOT for new plug-ins.
- The brand SSOT (`globals.css` four-layer system, `ui-*` classes). Don't introduce raw palette colors or arbitrary text sizes; the project CLAUDE.md has an audit grep that catches violations.

### What's deferred and why
| Task | Why deferred |
|---|---|
| **`useControlData` split into 3 hooks** (#56) | The hook is 325 lines doing 4 jobs. Audit said split into `useControlData` (snapshot), `useAgentConfigDraft` (form), `useControlMutations` (dispatch fns). Real refactor; many consumers; no integration test harness to prove safe. Worth a focused day. |
| **`ProjectState` schema derivation** | The control-types ProjectState is a wire format that composes the DB row + computed fields. Audit suggested deriving from `DbProjectState` via Pick + extra fields. Risk: many UI components consume the current shape; touching it has wide blast radius. Worth careful diff. |
| **Self-hosted apt repo at `apt.fleetcrown.com`** (#48) | The user has hit this. v0.7.5 banner covers the symptom; the durable answer is a proper apt repo with GPG signing. 1-2 day project (key gen + Packages.gz pipeline + static hosting on the box behind Caddy + docs). |
| **Publish to Flathub** (#47) | Backlog; only relevant when Linux user count is meaningful. |
| **First-launch wizard polish** (#61) | `/onboarding` + `EmptyStateWelcome` + `MissingCLIsBanner` already cover the major beats; a unified "agents detected ✓ terminal detected ✓ first project ✓" celebration screen would be nice but not blocking. |
| **OrangeCat off managed Supabase** (#16) | Done 2026-06-12 — OrangeCat now runs on the self-hosted Supabase stack at `supabase.orangecat.ch` on the Hetzner box. Sibling product; not a FleetCrown task. |

### What's broken / known footguns
- **Auto-update on .deb is silently broken at the OS level.** electron-updater downloads but can't apply (sudo needed). v0.7.5's UpdateBanner is the user-facing fix. The durable fix is task #48 (apt repo).
- **Smoke test (`npm run smoke`) requires the local dev server.** Husky pre-push skips it when the server isn't running. Run `npm run dev` before pushing if you want full validation.
- **`drizzle-kit push` is the historical migration path on prod.** Migration ledger now exists; future deploys should use `drizzle-kit migrate`. Push is still safe for dev DBs but DO NOT use on prod after this point.
- **Agent CLI distribution is by official installer, not bundled.** Fleet Runner bundles Zellij but not Claude/Codex/Grok/Gemini/Cursor. The "Install X" UI button on /control launches the agent's official one-line installer in a new Zellij tab. Detection lives in each adapter's `detectAvailable()`.

## 7. Strategic direction (what we are pursuing and why)

### The bet
Solo founder + AI assistant building two products under the (planned) `bitbaum AG` holding:
- **OrangeCat** — economic layer (BTC payments, escrow, transactions between humans). Runs on the self-hosted Supabase stack (`supabase.orangecat.ch`) on the Hetzner box since the 2026-06-12 exit off managed Supabase.
- **FleetCrown** — agent-fleet coordination (this product). Customer of OrangeCat.

The thesis: builders who run multiple agents in parallel need a single coordination surface. Owning that surface — not the models, not the terminals — is the position.

### Why this product shape
The "captain-mode SaaS" thesis says: the user shouldn't dispatch agents one at a time; they should **govern** a fleet. Auto-inject, autopilot, scheduler, prompt queue, beacon settings — every one of those is "FleetCrown decides when, the human approves." Hence: heavy investment in lifecycle signals (`session_status`, `session.md` handoffs), automation policy (`auto_inject_mode`), and dispatch decisioning (`lib/decide.ts`, autopilot watchdog).

### Why we shipped 5 desktop releases in 36 hours (v0.7.0 → v0.7.5)
v0.7.0 contained the **Phase C bundled-renderer-as-primary** flip — a premature architectural move that produced a broken user-visible experience (the "YOUR MACHINES. YOUR AGENTS. / 0 projects" screen). Each subsequent release reverted, fixed, or hardened: v0.7.1 reverted; v0.7.2 added Peek (the killer dignity feature); v0.7.3 auto-cleared dead tokens; v0.7.4 deleted the parallel UI for good; v0.7.5 fixed the silent-update gap that hid all of the above from the user.

**Lesson encoded in v0.7.4**: one UI codebase. The Phase-C aspiration ("Cursor-like fully local renderer") was discarded as YAGNI. FleetCrown is in the Slack/Linear/Notion category — web UI + native integrations.

### What we are NOT pursuing
- **Forking VSCode** (Cursor's path). Wrong product category; we are not an IDE.
- **CRDT sync for offline writes**. No multi-user concurrent editing problem.
- **Native iOS/Android apps**. PWA install + push notifications cover the mobile story for now.
- **Self-hosted DB / multi-tenant deployments**. Premature at 1 user. Architecture supports it (every query is user-scoped) but no productization yet.
- **Kubernetes / microservices**. A single Hetzner box handles 10k users. Discord ran on Postgres for years.

## 8. How to ship a desktop release (the muscle memory)

```bash
# Bump version
edit desktop/package.json   # "version": "0.7.X" → "0.7.Y"

# Append a CHANGELOG entry at the top of src/config/changelog.ts

# Commit
git add -A
git commit -m "feat(desktop): v0.7.Y — <one line>"
git push

# Tag → CI → mirror
git tag -a fleet-runner-v0.7.Y -m "v0.7.Y — <one line>"
git push origin fleet-runner-v0.7.Y

# Watch CI build (3-5 min) + mirror script auto-fires after success
gh run watch --workflow=desktop-release.yml --repo maonakamoto/fleetcrown

# Or use the existing Monitor pattern from earlier sessions:
until s=$(gh run list --workflow=desktop-release.yml --repo maonakamoto/fleetcrown --branch fleet-runner-v0.7.Y --limit 1 --json status,conclusion --jq '.[0] | "\(.status)/\(.conclusion)"' 2>/dev/null); [ -n "$s" ] && echo "$s" | grep -qE "completed/"; do sleep 30; done; echo "$s"
# Then on success:
bash scripts/mirror-desktop-release.sh 0.7.Y
```

The mirror script is the bridge between `maonakamoto/fleetcrown` (where CI builds) and `maonakamoto/fleetcrown-releases` (where users download). It uses workflow artifacts as the source, NOT the draft release — the draft race-conditions when matrix jobs all try to push.

## 9. How to dogfood

1. `npm run dev` — local Next.js at `:3000`.
2. The user's daemon runs as `systemd --user` unit `fleetcrown-app` (NOT a fresh `next dev` process). See `pattern_local_prod_systemd` in agent memory — this is a footgun.
3. Fleet Runner desktop wraps `fleetcrown.orangecat.ch` by default. Set `FLEETCROWN_WEB_URL=http://localhost:3000` for local dogfood.
4. Hit `/api/metrics` to see what the cloud knows about the user's recent activity.
5. Hit `/releases` to see the public changelog you've been writing.

## 10. First moves for the new agent

In priority order:

1. **Update task #42 (QA marathon)** — Quit + relaunch Fleet Runner v0.7.5 on the user's machine; verify the UpdateBanner appears with the correct dpkg command; verify Peek opens drawer; verify Cmd-K lists projects. **Report whatever doesn't work.**

2. **Build task #48 — the apt repo.** The user has been bitten by .deb auto-update twice. The v0.7.5 banner is a stopgap. The real fix:
   - Generate a GPG signing key (one-time, store private key in GitHub Secrets)
   - Build `Packages.gz` + `Release` + `InRelease` from .deb files per release
   - Host at `https://fleetcrown.orangecat.ch/apt/` (static files served by Caddy, or a `/api/apt/[...path]` route)
   - User installs once with `curl ... | sudo tee /etc/apt/sources.list.d/fleetcrown.list`
   - Future updates: `sudo apt upgrade fleet-runner`. No more silent failures.

3. **Get one real external user.** Everything below is theater until that happens. The single highest-leverage move for the product.

4. **Task #56 — split `useControlData`.** Risky but valuable for code health. Plan carefully. 325 lines, 17 returned fields, 4 distinct jobs.

5. **Lift `/api/metrics` JSON into a `/system` page card.** Currently the metrics are curl-able but not visible. Render them as a card grid on `/system` so the operator dashboard is actually a dashboard.

## 11. Important external context

The repo's `CLAUDE.md` files (project and user-global at `~/.claude/CLAUDE.md`) are the ground rules. Read them. Highlights:
- **Mao Nakamoto is a pseudonym.** Never use real name or "Gosha" in code/commits/messages.
- **Exact action steps for the user.** Full URL + numbered steps + UI branches + verification. No vague directives.
- **Design tokens are SSOT.** Four-layer system in `globals.css`; no arbitrary hex / sizes in JSX.
- **First-principles, not analogy.** Don't say "X does it this way." Say "the constraint is Y, so we do Z."

Agent memory at `~/.claude/projects/-home-g-dev-fleetcrown/memory/` has additional historical context across sessions.

## 12. Where to look when something breaks

| Symptom | First place to look |
|---|---|
| "Daemon offline" but the daemon is running | `~/.config/fleetcrown/fleet-runner-token` — is it 401-rejecting against `/api/control/runtime-state`? |
| `/control` shows old data | Check the bridge SSE connection in browser DevTools network tab. Or check `runtime_snapshots` for `observed_at` freshness. |
| Dispatch goes nowhere | `pending_commands` table — was the row inserted? Did the poller claim it? Check `result` field after claim. |
| Auto-update silently fails | It does on .deb. That's why v0.7.5 ships the UpdateBanner. Task #48 is the real fix. |
| `drizzle-kit migrate` wants to re-apply old migrations | The ledger now exists. If somehow it's empty, re-run `npx tsx scripts/db/bootstrap-migration-ledger.ts --apply` with `DATABASE_URL` set. |
| /api/metrics is empty | Either the user has no activity in the last 24h, or the new metric query you added has a bug. Check `getDispatchMetrics`/`getRunMetrics` in `src/db/queries/metrics.ts`. |

---

**End of handoff.** When you're done with your session, append your own one-paragraph summary to the changelog (`src/config/changelog.ts` for desktop releases, this doc for architectural changes), and update `MEMORY.md` at `~/.claude/projects/-home-g-dev-fleetcrown/memory/` with anything surprising or non-obvious that future-you would want to know.

Build for change. Ship correct code.
