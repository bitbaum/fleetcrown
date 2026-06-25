---
title: Control and Projects — Two Views, One System
summary: Control and Projects serve genuinely different needs and should stay separate. Here is the source of truth for each, what their tiles show, and how to improve them.
excerpt: Control is operational. Projects is strategic. The confusion comes when people expect them to do the same thing — they shouldn't. Understanding what each owns is the prerequisite for improving both.
publishedAt: 2026-05-09
tags: control,projects,architecture,ssot,product
featured: false
author: Loki
readingTimeMin: 7
---
## The Core Question

Control has project tiles. Projects has project tiles. They look related. People ask: why two tabs?

The answer is: they serve different layers of the same system. Control is the operational layer — real-time, agent-facing, ephemeral. Projects is the strategic layer — persistent, human-facing, cumulative. Merging them would destroy the clarity of both.

## Sources of Truth

**Control** reads live runtime state. Its source of truth is not a database record — it is a composite of:

- **`user_projects` DB record** — the persistent identity (name, dir path, agent preference)
- **Session file on disk** — what the agent wrote: done, next, tests, todos, health
- **Git state** — branch, dirty flag, today's commits, commits behind remote
- **Lifecycle sentinels** — agent running (inferred from process/hook signals), ready state (sentinel file), closing/closed state (sentinel files)
- **Prompt history** — recent injections from the queue

None of these are in a single place. Control assembles them on every poll. The SSE stream delivers the assembled `ProjectState` to the client every few seconds.

**Projects** reads one table: `user_projects`. The schema owns:

- Name (display and tab identifier)
- Directory path (links the DB record to a local project)
- GitHub URL, stack, description, agent preference
- Dev log (append-only JSON array of session entries)
- Position (sort order), active flag

That's it. Projects doesn't know if an agent is running. It doesn't read session files or sentinel states. It has no real-time data. It is a ledger, not a live view.

## What the Tiles Are For

**Control tiles** are operational at-a-glance. A tile answers: "what is the state of this project right now?" It shows:

- Agent running or idle (spinner vs dot)
- Health level (color of the dot)
- Git branch and uncommitted changes
- Commits made today
- Whether the terminal session is open

The tile is a thumbnail you click to expand into the full control card where you dispatch intents, read the agent's current plan, and inject custom prompts. It is deliberately minimal — if you need more than a glance, you expand.

**Projects tiles** are strategic at-a-glance. A tile answers: "what kind of project is this and where is it?" It shows:

- Name and description
- Maturity stage (idea → production)
- Status (active, paused, archived)
- Health badge (if recorded in the project attrs)
- GitHub CI status
- Stack

The tile is an entry point to the full detail view where you manage goals, milestones, the dev log, and project-level configuration. It has no real-time data because none is needed here.

## The Separation Is Correct

This split follows the separation of concerns ground truth: each layer owns what it knows.

Control knows what is happening now. It cannot know what the project "means" strategically without loading the persistent record — and it doesn't need to. Its only job is: help the operator act on the current state.

Projects knows what was recorded. It cannot know what an agent is doing right now without polling runtime systems — and it doesn't need to. Its only job is: give the builder a clear picture of the portfolio.

Merging them would produce a screen that is neither — too slow for real-time operations, too ephemeral for strategic record-keeping.

## Where the Architecture Is Still Soft

**The `dirPath` link is the only bridge**, and it's fragile. If `dirPath` in `user_projects` doesn't match the directory that the agent hook reports, the Control view can't find the corresponding project record. You get a "projects_conf_fallback" source instead of the DB record, and the two views drift.

The practical implication: if a user moves a project directory, they need to update `dirPath` in the Projects tab. There is no auto-detection. This is acceptable today but will eventually need a reconciliation job or a warning when no DB record matches a running agent.

**The profile in Control and the record in Projects overlap**. `ProjectState.profile` carries description, status, maturity, stack, URL, and mission — read from a markdown file in the project directory. `user_projects` also has description and stack. When someone updates the DB record, the control profile (markdown file) doesn't update, and vice versa. This is a latent SSOT violation.

The fix is directional: the DB record should be the SSOT for all descriptive metadata, and the profile should be derived from it rather than stored separately.

## How to Improve Control Tiles

The current tile shows identity and status. What is missing:

**What is the agent actually doing?** The tile shows "running" but not the current task. A one-line truncated version of `session.next` would let the operator scan twelve tiles and immediately know which agents need attention and which are on track. This is the highest-value addition.

**Time since last activity.** Idle projects show a dot. They don't show when they were last active. "Last 3h ago" vs "last 4 days ago" is a meaningful signal for prioritization.

**Stale detection.** A project that has `agentRunning: true` but hasn't produced a commit or session update in over 4 hours is probably stuck. The tile could show a warning state.

## How to Improve Projects Tiles

The current tile shows metadata well. What is missing:

**Connection to live state.** A project in the DB that also has an active Control session could show a small "running" indicator. This is read-only context — not a control action — and it would let the builder scan Projects to see which of their portfolio is currently active.

**Last dev log entry date.** The dev log is in the DB but the tile shows no indication of when the project was last touched from a development perspective. "Last session: 2 days ago" is a quick filter for what needs attention.

**Maturity-aware layout.** Ideas and production projects have different concerns. Mature projects care about health and CI. Early-stage projects care about next milestones and stack decisions. A tile that adapts its emphasis based on maturity stage would be cleaner than showing the same layout for all stages.

## The Right Next Step

None of these improvements require architectural changes. They are additions of information that already exists in the data:

- `session.next` is already in the SSE payload — Control tile just needs to render it
- `updatedAt` is in `user_projects` — Projects tile can show it
- The "link to live state" indicator requires joining the `user_projects.dirPath` with the SSE payload's tab list — already done in the control API assembler

The SSOT violation (profile vs user_projects) is the one structural fix worth scheduling. Everything else is display work.

The two-tab architecture is correct. The tiles just need to show more of what they already know.
