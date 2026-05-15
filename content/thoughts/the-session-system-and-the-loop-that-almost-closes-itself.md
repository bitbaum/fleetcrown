---
title: The Session System and the Loop That Almost Closes Itself
summary: How Cockpit's prompt library and session handoff protocol work together — and the one missing piece that separates a manually-triggered execution system from a genuinely self-improving one.
excerpt: Thirty-two prompt templates and a five-field handoff are not features. They are the architecture of continuity. Here is what they do, why the design matters, and the precise gap between where this system is now and where it needs to go.
publishedAt: 2026-05-15
tags: architecture,prompts,sessions,orchestration,autonomy,product
featured: true
author: g
readingTimeMin: 14
---

## The Real Problem Is Not Writing Code

Every builder running multiple projects knows the cost that doesn't show up in productivity metrics. It is not the time spent writing code. It is the time spent remembering where you were.

You open a repo after two days away. You check the last commit message. You read the README. You run the dev server and stare at the UI trying to reconstruct what you were doing and why. Ten minutes gone before a line is touched. If you switch between four active projects in a week, you lose forty minutes to orientation alone — and that assumes you find everything you need. Often you don't.

The problem compounds under AI-assisted development. Models have no memory between sessions. Every cold start means re-establishing context: what the project is, what was last done, what the conventions are, what the current blocker is. Without a protocol for that, AI assistance is brilliant within a session and amnesiac between them.

This is the coordination problem Cockpit was built to solve. Not "make coding faster" — that's an easy pitch that misses the actual bottleneck. The actual bottleneck is continuity: keeping work moving across sessions, across days, across the unavoidable gaps that come with running a portfolio of projects simultaneously.

Two mechanisms are now operational. They work together in a way that becomes clear once you see the design.

## The Session System: A Protocol, Not a Log

The session system is five fields:

```
done: <one sentence of completed work>
next: <one sentence of highest-impact remaining work>
tests: <pass/fail snapshot>
todos: <count>
health: good | needs attention | critical
```

These are written at the end of every session — by the agent that just finished — and injected at the start of the next one.

The difference between a protocol and a log is important. A log describes what happened. A protocol specifies what the next agent needs to function. The session handoff is the latter. It is not documentation about the past; it is a contract for the future.

Each field carries a specific information payload:

`done` tells the incoming session what actually shipped. Not what was worked on — what completed. This prevents the failure mode where an agent picks up "improve performance" from the last session's notes and starts new work without knowing that the improvement was actually finished yesterday.

`next` is the most operationally critical field. It is written by the agent that just finished — the one with the most current context — and it names the highest-leverage remaining move. The incoming agent inherits not just a todo list but a prioritization judgment made by someone who just finished working through the problem.

`tests` and `todos` give the health snapshot without requiring the incoming agent to run a full audit before starting. The count is enough. If tests went from 12 pass to 9 pass, something broke. The incoming agent knows to investigate before doing anything else.

`health` is a single-word gate. `critical` means stop everything and look. `needs attention` means don't add to the debt. `good` means the baseline is stable and the session can focus on forward progress.

Together, five fields do what would otherwise require five minutes of manual orientation — and they do it without the orientation being done by a human. The outgoing session writes it; the incoming session reads it; the loop continues. The human stays in judgment mode.

## The Prompt Library: Accumulated Operational Intelligence

The session system solves continuity. The prompt library solves a different problem: preventing useful workflows from staying trapped in the head of whoever invented them.

Every team that uses AI agents seriously accumulates a corpus of effective prompts. Some of those prompts are one-off — written for a specific task and then lost. Others are patterns: the sequence of checks that reliably catches architectural drift, the instruction structure that gets an agent to produce a complete feature instead of a stub, the review format that finds real bugs rather than surface issues.

The prompt library is where those patterns live.

Cockpit has thirty-two templates across six dimensions: engineering, UX, deployment, product, marketing, and business. Each is parameterized with variables — `{name}`, `{path}`, `{mission}`, `{url}` — so the same template runs against any project without modification.

What makes a template good is not brevity. It is structural completeness. A template that looks terse often fails because it leaves the agent without a decision framework. A template that specifies the right decision framework — here is the context you have, here is how to triage, here is the scope, here is what you cannot do, here is when you are done — consistently produces work that doesn't need to be undone.

The architecture behind the templates is a five-dimension framework: State (what context does the agent have?), Priority (how does it choose what to do?), Action (what must it actually do?), Constraints (what is out of scope?), and Exit (when is it done?). Each dimension addresses a distinct failure mode.

Without State, agents start cold and make wrong assumptions about what exists. Without Priority, autonomous agents pick the most visible problem rather than the most important one. Without a scoped Action, they either stop too early or work forever. Without Constraints, they add features when they should be fixing bugs, or produce analysis when they should be writing code. Without a clear Exit, they either undershoot or overshoot and require correction.

The thirty-two templates represent thirty-two working answers to these five questions, accumulated across actual use. They are not hypothetical. Each is a pattern that survived contact with a real codebase and produced the intended result.

The most important template is `next_best`. It is the default — the prompt the system fires when there is no specific task, when the incoming session has to choose. Its current form is a four-tier triage:

1. Broken or urgent: uncommitted work to resume; type errors
2. Engineering quality: architectural violations, DRY failures, oversized components
3. UX and live app: open the running application in a browser, walk the most recently changed view, find and fix the most impactful broken or confusing thing
4. Business and product: re-read the mission, identify the most impactful gap, implement the smallest change that closes it

The decision rule is: stop at the first non-clean tier and execute it completely. Not partially — completely. This is the constraint that prevents the failure mode of touching everything and finishing nothing.

## The Tiers That Separate Engineering from Product Work

The four-tier structure of `next_best` reflects a real hierarchy of consequence. Getting the ordering right matters because autonomous systems without explicit priority ordering default to whatever is most visible, which is usually not what matters most.

Tier one (broken/urgent) is obvious. If there is uncommitted work in progress, abandon everything and resume it — context on in-flight work evaporates fast. If there are type errors, they compound. Fix them first.

Tier two (engineering quality) is where most systems stop. SSOT violations, DRY failures, components that have grown too large, raw database queries scattered outside the query layer — these are the silent debt that makes everything else slower. Addressing them before moving to product work ensures that new features are built on a stable foundation rather than compounding an already-fragile one.

Tier three (UX and live app) requires a real browser. Not code inspection — actually opening the application and using it. The gap between what the code says should happen and what a user actually experiences is consistently larger than it looks from the source. Missing empty states, mobile layout breaks, copy that misleads, dead-end flows that have no recovery path — these only appear when you're actually in the app.

Tier four (business and product) is last not because it matters least, but because it is the least fragile. Shipping a new feature into a codebase with broken tests, architectural drift, and a confusing UX is not progress. It is debt compounded. Tier four only fires when the first three are clean — which means new product work is always built into a stable system.

## What the Architecture Reveals About What Is Still Missing

The session system and prompt library together form a working execution loop. But the loop has gaps that become visible once you understand the structure.

The most operationally significant gap is that the loop is manually triggered. The `next_best` prompt fires when a human opens a terminal, loads the session, and runs it. Between sessions — overnight, during meetings, while working on a different project — nothing moves. The accumulated intelligence in the prompt library and the continuity infrastructure in the session system are idle.

One change closes this gap: a lightweight cron job that fires `next_best` on a schedule when no session is currently active. The mechanism is simple. The consequence is significant: work advances on a project without the builder having to initiate it. The queue doesn't fill during gaps; it drains. The session handoff written at 11pm is the starting point for work that happens at 4am.

This is not automation in the abstract. It is a specific, bounded capability: apply the highest-priority operational template to the highest-priority project on a schedule, using the session protocol that already exists for continuity, without human initiation. The judgment — which project, which action, when — is encoded in the templates and the triage ordering. The system has enough accumulated operational intelligence to make those decisions. It just can't make them without being asked.

A second gap is capture. The system is command-line and desktop-native. There is no way to record a thought from a phone. If an observation surfaces while away from the machine — a UX problem noticed during actual use, a product idea, a decision that needs logging — it either gets written somewhere disconnected and has to be bridged back manually, or it's lost.

A minimal solution would be a textarea on the Today view that saves to the database and surfaces in the next session. Not a full mobile app — just the ability to put something in the system from anywhere, so it's there when the next session starts. The session protocol handles what to do with it from there.

The third gap is persistence of agent output. Agent runs currently stream to the terminal and disappear. The text that comes back from a session — what was done, what was discovered, what decisions were made — is visible only during execution. There is no run history, no trend analysis, no way to answer: is this project's quality score improving? Which intents actually produce features that ship? Which produce noise?

Storing run output per project changes the system from a dispatcher into a learner. With history, the prompt library can improve based on what actually worked. Without it, evaluation is based on intuition and the developer's memory of recent sessions.

The fourth gap is cross-project intelligence. Cockpit has data about every project: recent commits, session health, test status, todo count. But that data is per-project, not synthesized across the portfolio. The question "which project needs attention most right now?" has an answer — it's in the session files and git logs — but the system doesn't compute it. A builder with six active projects has to hold the priority ordering in their head rather than reading it from the system.

This is the gap between a dashboard and an operating system. A dashboard shows data. An OS makes decisions based on data. Cockpit has the data; the synthesis layer is missing.

## The Habits-to-Goals Connection

One gap deserves its own note because it reveals something about the life OS framing.

Habits and goals are tracked separately in Cockpit. The habit heatmap shows thirty-day check-off patterns. The goals view shows hierarchical targets with progress tracking. But there is no connection between them. A habit like "read for thirty minutes daily" and a goal like "finish the ML fundamentals curriculum" are not linked. The system doesn't know that one feeds the other.

This matters because the life OS framing only becomes real when the system can answer: is this habit serving a goal? Which habits are not connected to anything? Which goals have no habits supporting them?

Without that connection, habits and goals are two separate lists. With it, the system has a genuine model of how daily behavior relates to longer-term outcomes. That is the difference between tracking activity and understanding trajectory.

The data model is ready — both tables have user IDs and the schema could link them with a junction table. The gap is product: the UI for building that connection and the intelligence for surfacing whether it's working.

## Multi-Tenancy and the Public Surface

The data model was built for multi-user from the start: user IDs on every table, Drizzle schema that's correct for isolation, OAuth working through NextAuth with both GitHub and local auth. The infrastructure is ready. What's missing is the product layer: invite flows, per-user agent isolation, and billing.

The settings view has a team invite UI stub that isn't wired to the invite system. That gap is small and mechanical — the hard part (data isolation) is already done. The invite flow is an afternoon, not an architecture.

The public profile (`/u/[username]`) is more interesting. It currently shows a builder's projects and recent writing. It exists as a feature but it's underlinked — there's no path from anywhere in the product to the public profile, no affordance that says "this is visible to others." The surface could become a build-in-public feed: a lightweight way to broadcast what's being worked on, what shipped this week, what the system's current health is. The data for all of that already exists; the framing doesn't.

## The Tighter Agent Channel

Agent dispatch currently relies on file-based handoffs and shell scripts: the session file is written by the agent, read by the next invocation, injected into the prompt. This works, but the channel is one-directional and synchronous. The agent writes; the next session reads.

A bidirectional channel — WebSocket or named pipe — would change the execution model. The control panel could receive real-time status from an active agent session: what it's doing right now, whether it's blocked, what it found. The builder could intervene without terminating the session. The agent could surface a decision point — "this change has a large blast radius, confirm?" — and receive a response mid-run.

The current architecture requires either full autonomy (let it run) or full control (manually supervise). A bidirectional channel enables the middle ground: autonomous by default, interruptible when needed. That matches how a good engineering team actually works — not micromanaged, not unsupervised, but connected.

## The Threshold Between Tool and System

There is a qualitative threshold between a tool and a system. A tool does something when you use it. A system operates on its own, improves over time, and degrades gracefully when it can't do something.

Cockpit is currently a tool with strong system architecture. The session protocol, the prompt library, the triage framework, the db/queries layering, the deployment pipeline — these are system thinking applied to a tool. But the tool still requires a human to start every cycle.

The cron-triggered `next_best` loop is what crosses the threshold. Once the system fires autonomously, applies the best available operational template to the highest-priority project, and writes a session handoff for the builder to review, the dynamic inverts. The builder reviews output rather than initiating work. The session file is a report rather than a starting point.

What makes this tractable — unlike most "AI autonomy" pitches — is that the judgment is already encoded. Thirty-two templates contain thirty-two operational strategies. The triage ordering encodes which problems matter most. The session protocol encodes how to hand off state. The pieces are in place. What's missing is the scheduler.

## What This Means in Practice

The mission of Cockpit is: stay in judgment mode while agents handle execution.

Every architectural decision traces back to that. The session system ensures agents don't start cold, which means the builder doesn't have to brief them. The prompt library ensures good workflows are reusable, which means the builder doesn't have to reconstruct them. The triage framework ensures agents pick the right task, which means the builder doesn't have to queue work manually.

The remaining gaps are all variations on the same problem: there are moments where the builder still has to initiate, collect, or synthesize something that the system could do itself.

Mobile capture: the builder has to bridge an observation from their phone into the system manually. A textarea in Today closes that.

Agent run history: the builder has to evaluate prompt quality from memory. Stored output closes that.

The autonomous cron: the builder has to start every cycle. A scheduler closes that.

Cross-project synthesis: the builder has to maintain a mental model of portfolio health. A priority computation closes that.

None of these are architectural rewrites. They are extensions — closing loops that are already partially open. The infrastructure exists. The data is there. The remaining work is product: deciding what form each loop takes and what it means for the builder's day when it runs.

A system that applies accumulated operational intelligence to a portfolio of projects on a schedule, without requiring human initiation, while writing clear handoffs that let the builder review and redirect at any point — that is the life OS model made operational.

It is one scheduler away.
