# FleetCrown Agent Execution Platform

**Status:** Architecture / north star. LocalPtyExecutor shipped; Docker-backed
SandboxExecutor substrate shipped behind an explicit env flag.
**Last updated:** 2026-07-03
**Scope:** How FleetCrown runs, streams, observes, and controls agent processes for
many tenants on arbitrary client devices — without puppeting anyone's terminal.

---

## Non-negotiables (the requirements that kill the current design)

1. **Billions of users, any device/terminal.** Web, mobile, an IDE, or a power user's
   own shell — none can be the *substrate* for execution. The terminal is a **view**.
2. **Multi-tenant SaaS.** Agents run untrusted code → hard isolation per agent.
3. **Long-running + resumable.** Agents pause, hibernate, and resume across nodes.
4. **No dependence on the user's local machine or multiplexer.** zellij/tmux/iTerm are
   not assumptions. Most users will never run anything locally.
5. **Cost-efficient at scale.** Most agents are idle most of the time → you cannot keep
   billions of live containers; idle agents must hibernate and free their compute.

The current path violates all five: it shells into the user's zellij, guesses
session/tab **names**, mimes keystrokes, scrapes the screen for status, and depends on
a `/tmp` sentinel. That is a single-user, single-box, one-multiplexer hack.

---

## First principles

- **An agent is a process with: a PTY (stdin/stdout), a filesystem (the workspace), a
  lifecycle, and observable state.** Nothing about that requires zellij or a tab name.
- **FleetCrown must OWN that process's PTY and environment** — spawn it in compute we
  control — rather than borrow a human's interactive terminal.
- **The terminal is a rendering target, never the substrate.** Same owned byte-stream
  renders to the browser `xterm`, a mobile view, or a native attach client.
- **State is event-sourced from the owned process**, never screen-scraped or inferred
  from `/tmp`. "Working" = the process emitted work / has live output, as a fact.
- **Identity is a stable id FleetCrown assigns**, never a zellij name we have to find.

---

## The four planes

```
┌─ Control plane ─────────────┐  stateless, horizontally scalable (the Next.js app/API)
│ auth · tenancy · orchestration · scheduling · billing · dashboard
└─────────────┬───────────────┘
              │  Executor interface (the ONE abstraction)
┌─ Connection plane ──────────┐  streaming gateway (WS/gRPC), multiplexed, sharded by
│ PTY bytes + events ⇄ browser │  tenant, resumable (ring-buffer replay on reconnect),
│ xterm; backpressure-managed  │  backpressure-aware
└─────────────┬───────────────┘
┌─ Execution plane ───────────┐  one agent per sandbox (Firecracker microVM / gVisor /
│ isolated PTY + FS + secrets  │  K8s pod / Fly Machine / e2b). Autoscaled, bin-packed,
│ per agent; hibernates idle   │  hibernates when idle.
└─────────────┬───────────────┘
┌─ State plane ───────────────┐  durable event log = SSOT for agent status; object
│ event log + FS snapshots     │  storage for workspace snapshots → pause/resume/migrate
└─────────────────────────────┘
```

---

## The one abstraction: `Executor`

Everything hangs off a single interface. Terminal-agnostic by construction — it traffics
in **bytes + a stable handle + structured events**, not tabs and names.

```ts
interface Executor {
  provision(spec: WorkspaceSpec): Promise<WorkspaceHandle>;   // stable id, not a name
  attach(handle: WorkspaceHandle): DuplexByteStream;          // PTY in/out
  events(handle: WorkspaceHandle): AsyncIterable<AgentEvent>; // lifecycle/status, event-sourced
  snapshot(handle: WorkspaceHandle): Promise<SnapshotRef>;    // hibernate
  restore(ref: SnapshotRef): Promise<WorkspaceHandle>;        // resume (maybe on another node)
  terminate(handle: WorkspaceHandle): Promise<void>;
}
```

Implementations are added in order — **same interface, no control-plane/UI changes**:

| Executor | Backend | Serves |
|----------|---------|--------|
| `LocalPtyExecutor` | `node-pty` on one box | dev + single-box self-host; **proves the interface end-to-end** |
| `SandboxExecutor` | Docker today; Firecracker / gVisor / K8s / Fly Machines / e2b later | **multi-tenant production scale** (replaces today's `pending_command` keystroke hack) |
| `LocalRunnerExecutor` *(optional)* | the user's own machine via Fleet Runner | power users who want "run on my hardware" |

zellij/tmux are **not executors** — at most an *optional view* a power user attaches to a
`LocalRunnerExecutor`. The current zellij path is legacy, retired once `LocalPtyExecutor` lands.

---

## Why this scales to billions (it's a trodden path)

Same shape as GitHub Codespaces, Replit, Gitpod, Coder, e2b.dev, Fly Machines, Devin:
**stateless control plane + autoscaled per-tenant microVMs + hibernate-when-idle +
streamed PTYs.** The hard parts (isolation, hibernation, streaming) are solved patterns,
not research.

---

## Build order (every step is on the path — nothing thrown away)

1. **`Executor` interface + event-sourced workspace state** — the SSOT. Status comes from
   the event log, not `/proc` scans or `/tmp` sentinels.
2. **`LocalPtyExecutor` + stream to the `@xterm/xterm` already shipped** — FleetCrown works
   with **zero zellij**, single-tenant. This is the proving ground for the interface.
3. **Unify the dashboard on the Executor model** — wrap or deprecate the existing
   zellij + cloud paths behind it; one mental model.
4. **`SandboxExecutor`** — Docker-backed substrate behind `FLEETCROWN_EXECUTOR=sandbox`.
   It enforces a workspace root, per-container resource limits, `no-new-privileges`,
   `cap-drop=ALL`, and deny-by-default networking. This is the execution primitive;
   product entitlements still decide who may use hosted execution.
5. **Hibernation + autoscaling** — checkpoint idle agents, free compute; cost at scale.
6. **Native-attach gateway (optional)** — let power users attach their own terminal to a
   workspace over the connection plane.

## What this retires

zellij/tmux name-guessing · `/proc` cwd matching · `/tmp` currentPrompt sentinels ·
screen-scrape status derivation · the `pending_command` keystroke-injection transport.

## Relationship to current code

The Next.js app stays as the **control plane**. The `feat/embedded-terminal` work
(`@xterm/xterm`) is the **view** for step 2. The reliability fixes shipped 2026-06-17
(timeouts, launch-state sentinel, verified inject) keep the **legacy zellij path** usable
until `LocalPtyExecutor` replaces it — they are a bridge, explicitly not the destination.

## SandboxExecutor Runtime Knobs

The active executor is selected in `src/lib/agent-execution/index.ts`.

- `FLEETCROWN_EXECUTOR=local-pty` (default): node-pty on the host.
- `FLEETCROWN_EXECUTOR=sandbox`: Docker-backed sandbox.
- `FLEETCROWN_SANDBOX_IMAGE`: image to run; default `ubuntu:24.04`.
- `FLEETCROWN_SANDBOX_WORKSPACE_ROOT`: only `cwd` values under this root are accepted.
- `FLEETCROWN_SANDBOX_NETWORK`: `none` (default) or `bridge`.
- `FLEETCROWN_SANDBOX_CPUS`, `FLEETCROWN_SANDBOX_MEMORY`, `FLEETCROWN_SANDBOX_PIDS`: resource caps.
- `FLEETCROWN_SANDBOX_USER`: `current` (default) or `root`.
- `FLEETCROWN_SANDBOX_MOUNT`: `rw` (default) or `ro`.

Important: this substrate does **not** by itself make hosted execution public. The
shared cloud builder remains private until hosted entitlements, per-user
credentials, metering, and onboarding smoke tests are complete.
