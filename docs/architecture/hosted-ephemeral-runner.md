# Hosted Ephemeral Runner

**Status:** design + Phase 0 in progress (2026-06-25)
**Why:** FleetCrown commands a fleet it doesn't run — execution lives on the
operator's laptop (Fleet Runner). When the laptop sleeps, every project shows
"Offline · runner offline" and autopilot does nothing. This is the keystone gap
(see Thoughts: *The Captain Needs a Ship*). A hosted runner executes dispatches
on cloud compute so the fleet runs regardless of the operator's machine.

## The loop we reuse (do NOT reinvent)

A runner — local OR hosted — is just a process that:

1. **Registers presence** — connects to the bridge over SSE; the bridge writes
   `runner_presence.connected = true` on connect, false on disconnect
   (connection-based, not heartbeat — see `connection-presence.md`). This is
   what flips a project from "Offline" to live.
2. **Drains the queue** — claims rows from `pending_commands` via
   `claimNextCommand` (`FOR UPDATE SKIP LOCKED`, so two pollers never claim the
   same row). Commands are enqueued by the cloud (`enqueueDispatchCommand`,
   `enqueueInjectCommand`, …) when the operator dispatches from Control.
3. **Executes** — runs the agent against the project with the task + the
   injected project context (`getProjectContext` → mission/stack/conventions/
   definition-of-done/goals).
4. **Reports** — closes the `orchestration_run` with an outcome
   (`inferOutcome` / the DoD gate) and updates `project_states` so Control
   reflects live state.

The hosted runner does all four — the only difference from the Fleet Runner is
*where it runs* and *how the agent is sandboxed*.

## The hard constraint: isolation

The box (`fleetcrown-app` on Hetzner) also serves the public app, the bridge,
and Ivy. **Never run an unsandboxed coding agent that writes code and runs
shell on that box.** A prompt-injected or buggy agent there is a prod incident
and, in multi-tenant mode, a cross-tenant breach. Every phase below is gated on
isolation appropriate to what the agent can do.

The box today (confirmed 2026-06-25): node/npx/git present; **no** agent CLIs,
**no** zellij, **no** repo clones. So execution capability must be *added*, in a
sandbox, not assumed.

## Phases (ship in order; each is independently useful)

### Phase 0 — Read-only analysis runner (safe, no code execution)
A box-side worker that handles the *read-mostly* dispatch classes — analyze,
plan, review, summarize — with **zero write/exec risk**:
- Shallow-clone the repo read-only into a temp dir (GitHub token, depth 1).
- Run the analysis via **Groq** (already used for the frontier digest / DoD
  gate / brief extraction — server-safe, no shell).
- Post the result as the run outcome (a report/plan/review), delete the temp dir.
- Register bridge presence so these projects stop showing fully dark.

This proves the whole loop (presence → claim → clone → run → report → teardown)
with nothing that can damage the box or a tenant. It already delivers value:
autonomous repo analysis and planning without the operator's laptop.

### Phase 1 — Sandboxed single-tenant coding agent
A container (Docker on the box, or a dedicated worker VM) with a coding agent
(claude/grok CLI) + scoped credentials. Clones the repo, runs the task, commits
+ pushes a branch, opens a PR, reports. **Founder's own projects only** — no
multi-tenant credentials in the sandbox yet. The container is the trust
boundary; the app box never runs the agent directly.

### Phase 2 — Ephemeral per-dispatch compute
One fresh, isolated environment per dispatch, torn down after — Firecracker
microVMs, or a Daytona/Modal-style backend (Hermes's model: "runs where the
computation is, costs ~nothing idle"). No persistent agent state between tasks;
the project's profile + memory carry continuity instead.

### Phase 3 — Multi-tenant
Per-user credential scoping, resource limits/quotas, and network egress
controls so any user's projects can run hosted without touching another's.
This is the precondition for "anyone can sign up and have the fleet build."

## Integration points (files)

| Concern | Where |
|---|---|
| Presence | `runner_presence`, the bridge SSE handler, `getRunnerConnected` |
| Claim queue | `pending_commands` + `claimNextCommand` (SKIP LOCKED) |
| Project context to inject | `getProjectContext` (`db/queries/project-context.ts`) |
| Outcome close + DoD gate | `closeRunFromSession`, `inferOutcome`, `dod-gate.ts` |
| Reusable worker pieces | `home/` (watcher/worker/decide/render/state) |

## Credentials model
- **GitHub token** — clone + push + PR. Scoped per user (the same
  `getGithubToken` path; never the operator's token for another tenant).
- **Agent API key** — per runner, in the sandbox env only.
- **DB** — the runner reports via the cloud API with a runner bearer token, not
  a direct DB connection from inside the sandbox.

## Non-goals (for now)
Replacing the local Fleet Runner — it stays the right tool for "develop on my
own machine with my own tools." The hosted runner is the *default* so a project
is never dark; the local runner is the power-user/offline-first option.
