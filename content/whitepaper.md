---
title: The Builder's Operating System
subtitle: A technical architecture for sustained autonomous execution across many projects simultaneously
publishedAt: 2026-08-12
version: 0.2
---

## The Execution Gap

Every serious builder faces the same problem. The tools keep improving. AI models get faster, cheaper, more capable. Yet the bottleneck is never the tool. It is the operator.

The operator is you. The person who must decide what runs next, notice when something breaks, understand what each agent just did, and dispatch the next instruction — across five projects, each in a different state of motion.

This is the execution gap: the distance between the intelligence available in your tools and your ability to direct it consistently, at scale, without burning out or losing the thread.

FleetCrown is an operating system for closing that gap.

## Why Context Switching Kills Momentum

When a builder runs multiple projects simultaneously, each project exists in a mental model: what was last done, what broke, what to tackle next. These models decay. A three-day interruption is not three days of lost progress — it is three days of lost context that must be reconstructed before any progress is possible.

Traditional tools treat this as a knowledge management problem. Write things down. Use wikis. Maintain notes. But the problem is not storage. The problem is time cost and continuity. Reconstructing context is not free.

FleetCrown approaches this differently. The system itself maintains the model. Every agent session writes a structured handoff: what was completed, what comes next, what the health of the codebase is, how many open tasks remain. When you return to a project, FleetCrown surfaces the state — not as a document to read, but as an operational signal: this agent is ready, here is what it proposes to do next.

The operator makes one decision. The loop continues.

## The Agent Paradox

AI agents create a new problem as they solve the old one.

A single agent writing code faster than a human is unambiguously useful. But a portfolio of five or ten agents, each in a different terminal tab, each completing tasks at different moments — this creates coordination overhead that quickly exceeds the time saved.

FleetCrown calls this the agent paradox: the more capable your agents, the more you need a system to manage them. Without a coordination layer, gains from agent execution are partially consumed by the cognitive cost of tracking, directing, and reviewing that execution.

The coordination layer is not an agent. It is an interface.

## The Builder Loop

The fundamental unit of work in FleetCrown is the builder loop:

```
Agent runs → signals completion → FleetCrown surfaces state → operator decides → agent runs
```

Each iteration is one cycle. FleetCrown is built to make this cycle as tight as possible:

1. The agent completes a task and signals the session lifecycle
2. FleetCrown reads the session file and marks the project ready
3. The operator sees the ready state and the proposed next action
4. With one tap or keystroke, the next iteration begins

Auto-continue removes the operator from steps 2–4 entirely for routine continuation. The operator re-enters only when the loop requires judgment: a design decision, an ambiguous requirement, a broken test.

This is not automation for its own sake. It is a division of labor: the agent handles execution, the operator handles judgment. FleetCrown is the interface between them.

## Architecture

FleetCrown is a Next.js application that runs locally as a personal operating system and optionally connects to a cloud control plane for remote access and multi-device synchronization.

### State Propagation

Agent state flows from the terminal to the UI through a layered propagation mechanism:

The agent writes structured session files to `/tmp` on completion. These files contain the session handoff: what was done, what comes next, health indicators, test status, open tasks. The files follow a naming convention: `agent-ready-<tab>`, `agent-session-<tab>`, `agent-current-prompt-<tab>`.

The FleetCrown SSE stream reads these files at 2-second intervals and emits diff-patched updates to all connected clients. Only changed projects trigger events, keeping bandwidth minimal.

On the client, a React hook consumes the SSE stream and maintains the full project state map. Render cycles are bounded: only components tied to changed projects re-render.

### Agent Injection

Sending a prompt to an agent is not a queue operation or an API call. It is a direct terminal injection.

FleetCrown uses Zellij's `write-chars` and `write 13` commands to type a prompt into the correct terminal pane and submit it. The injection sequence is:

```
1. go-to-tab-name <tab>        — focus the correct tab
2. poll dump-layout             — wait for focus to confirm
3. write-chars -- <prompt>     — type the prompt
4. write 13                    — submit (Enter key)
```

The system resolves the correct tab name dynamically, matching against the live Zellij session at inject time. This handles tab renames and multiple sessions in the same directory.

### Typing Guard

Injecting into a terminal while the user is composing a command garbles their input. FleetCrown solves this with a per-pane typing guard.

ZSH `zle-line-init` and `zle-line-finish` hooks write and delete a marker file at `/tmp/cockpit-typing-<ZELLIJ_PANE_ID>` containing the tab name and a Unix timestamp. Before any injection — direct or queued — FleetCrown reads these markers. If the target tab has a live marker under 60 seconds old, injection is deferred until the user stops typing.

The daemon bridge respects the same guard: queued commands from the cloud control plane wait up to 30 seconds for the user to finish before executing.

### Remote Access: The Daemon Bridge

FleetCrown is a local application by design. It needs to be on the same machine as the terminal to inject commands. But operators increasingly need to dispatch from a phone, a second machine, or a shared device.

The daemon bridge is the solution.

When the FleetCrown server runs on a remote host (today: self-hosted on a Hetzner box), injections are written to a `pending_commands` table in the database rather than executed immediately. A local daemon script polls the cloud control plane over HTTPS, claims pending commands, executes them using the same injection primitives, and marks them done.

The same daemon pushes runtime state — agent processes, `/tmp` sentinel files, session health — to the cloud every 2 seconds, so the remote UI stays live.

```
Phone → Cloud control plane → pending_commands → Daemon → Zellij → Agent
```

No open ports. No SSH tunnels. No VPN. The local machine makes outbound HTTPS requests only.

### Dispatch Intelligence

When auto-continue fires, FleetCrown does not blindly send "next task." It routes intelligently.

If a prompt queue exists, FleetCrown asks the dispatch router — a Groq inference call on the session handoff and queue contents — whether to drain the queue or run the agent's own judgment. The router returns an action (`queue` or `nextbest`) with a reasoning string that appears in the UI.

The queue drain itself respects health gates: if the session reports critical health or failing tests, queue items are bypassed and the agent is forced into recovery mode. A broken project should fix itself, not accept new tasks that compound the damage.

### Session Lifecycle Signaling

Agent hooks are shell functions executed at the start and end of every Claude Code session. They translate terminal events into FleetCrown state signals:

- Session start: clears ready marker, writes current-prompt sentinel
- Session end: writes session handoff file, sets ready marker, pings FleetCrown
- Hard stop: writes closed and sentinel markers

These hooks are installed once and run automatically. The agent does not need to know about FleetCrown. The shell layer is the integration boundary.

### The Life OS Layer

Agent orchestration is the fleet management half of FleetCrown. The other half is personal operating surface.

Goals, habits, people, subscriptions, and commitments are tracked in the same interface as project and agent state. This is not an accident of feature creep. It reflects a truth about how serious builders work: the project is not separate from the life. Deadlines exist because of constraints. Habits determine momentum. People are collaborators and stakeholders.

FleetCrown makes this visible together so operators can reason about their actual situation, not a sanitized project view.

## Subscription Tiers

FleetCrown is offered as a hosted SaaS product with four subscription levels: a free tier and three paid tiers.

**Free** — for commanding your first projects. The full captain dashboard with your own runner and agent keys, limited in project count — enough to see the whole loop working before paying anything.

**Personal** — for solo builders managing up to 5 projects. Local runtime with cloud backup and remote access via the daemon bridge. Full project/agent/life OS features. Designed for the individual operator who wants to run the full system without self-hosting.

**Pro** — for power builders running 10+ active projects. Faster dispatch inference, extended prompt history, priority support, and direct access to new features in beta. Intended for builders where FleetCrown is an operational dependency.

**Team** — for small groups (up to 10 people) sharing a fleet. Multi-user project state, shared prompt queues, and team-level dashboards. Built for pairs and small studios who want a shared execution surface without enterprise overhead.

Self-hosted deployment remains fully supported for operators who prefer to run FleetCrown on their own infrastructure. The architecture is designed to run on a single machine with PostgreSQL.

## The Standard

FleetCrown is not a productivity app. Productivity apps make individual tasks faster. FleetCrown changes the relationship between the operator and the work.

The standard is: the operator stays in judgment mode. The agents stay in execution mode. The system maintains the state that connects them.

When this works correctly, shipping feels like directing, not doing. The operator's leverage is total attention on the decisions that require a human — not the mechanical steps that connect them.

That is the builder's operating system.
