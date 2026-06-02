---
title: "Prompts, Timing, and Orchestration: Where Agent Value Actually Lives"
summary: "The best prompt injected at the wrong moment is noise. Context-aware orchestration — reading session health, queue state, and project trajectory before deciding what to inject — is what separates a tool from a system."
excerpt: "A single auto-inject prompt that fires unconditionally is just automation. What makes it orchestration is when the system reads what's actually true about the project and picks the right prompt — or builds one — from that context."
publishedAt: "2026-05-18"
tags: agents,orchestration,prompts,automation,dispatch
featured: false
author: Ivy
readingTimeMin: 11
---

## The Problem With One Prompt for Everything

The first version of FleetCrown's auto-inject system did something simple: when Claude finished and you were away from the keyboard, it fired `next_best`. Every time. Regardless of what just happened, what the project's health was, what you'd queued up, or what time it was.

This is automation, not orchestration. The difference matters.

Automation says: "when X happens, do Y." Orchestration says: "when X happens, read the context, decide what Y should be, then do it." The first is a cron job. The second is a decision-maker.

The problem became obvious when a project entered a degraded state — type errors accumulating, tests failing, a broken smoke route — and `next_best` kept cheerfully advancing features on top of a crumbling foundation. The prompt told the agent to find the highest-impact gap. The agent found a feature gap. The feature shipped. The type errors grew. Nobody noticed until the build broke.

A prompt that ignores project health isn't useful. It's reckless.

## What the Hook Actually Knows

The moment a Claude session ends and the stop hook fires, the system has access to more context than it was using:

**The session file.** Five fields written at the end of every session: `done`, `next`, `tests`, `todos`, `health`. The `health` field alone — `good`, `needs attention`, or `critical` — is enough to branch the decision tree. A session that ended healthy should advance. A session that ended degraded should stabilize first.

**The queue file.** A JSON array of user-dispatched tasks sitting in `/tmp/agent-queue-{tab}`. If the user queued something from the Control panel while Claude was running, that item represents explicit intent. It should take absolute priority over anything the system would otherwise choose.

**Recent git history.** Ten commits of trajectory. What was just built, how fast, and in what direction. A burst of commits touching the same file suggests that area is in flux — worth verifying before advancing.

**The clock.** Late evening is a different context than morning. End-of-day sessions often have uncommitted work, half-finished features, and the kind of rough edges that compound overnight. Morning sessions benefit from orientation before execution.

For a long time, the system used exactly none of this to decide what to inject.

## The Decision Tree

The context-aware notification hook now works in a defined order:

**First: check the queue.** If the user dispatched a task while the agent was running, inject it verbatim. The queue represents pre-planned, explicit intent — it overrides everything. This isn't a suggestion from the system; it's an instruction from the user delivered asynchronously.

**Second: read session health.** If `health` is `needs attention` or `critical`, the right prompt is not `next_best`. It's `unblock` — a prompt whose only job is to run `tsc`, run tests, find the highest-severity failure, and fix it before anything else. Advancing features on a degraded baseline multiplies debt. The system now refuses to do that automatically.

**Third: default to `next_best`.** If the queue is empty and the project is healthy, `next_best` is the right call. It checks type health as its first step, then reads `session.next`, then discovers if nothing specific is named.

This is a small decision tree. Three branches. But it changes the character of what the system does — it stops being a trigger and starts being a reasoner.

## The Prompt Taxonomy

Not all prompts are created equal. Some are appropriate for every session; others are only right in specific circumstances. Understanding the taxonomy matters because it determines when and whether a prompt should ever auto-inject.

### Always-appropriate (auto-inject candidates)

**`next_best`** — The default. Checks correctness first (type errors), then reads explicit intent (`session.next`), then discovers. Works well for healthy sessions with a clear trajectory. The risk is in the discovery step, which requires the agent to judge impact from limited context. Keep `session.next` specific to reduce reliance on that step.

**`unblock`** — The corrective. Runs only when health is degraded. Its job is exactly one thing: make the project green again. No features, no discovery, no advancement. The moment all checks pass, it stops. This prompt should never run on a healthy project.

**`orient`** — The context loader. Reads git history, session state, and type health, then outputs a brief: what was built, what's broken, what to do next. No code changes. Appropriate after a long break, after a context-limit compaction, or at the start of a new day. It's the bridge between sessions, not a work session itself.

### Human-selected (popup candidates only)

**`test_and_fix`** — Runs the full test suite and walks primary flows with browser tools. More thorough than `unblock`, appropriate when you want full verification, not just green checks.

**`commit_push`** — End-of-session cleanup. Commits, verifies, pushes, monitors deployment. Should never auto-inject; the human should decide when work is ready to ship.

**`full_audit`** — Comprehensive: tsc, tests, browser walk, triage. More expensive. The human picks this when they want a full picture, not routine advancement.

**`quality`** — Code quality pass: TODO debt, SSOT violations, DRY violations, oversized components. Appropriate periodically, not after every session.

**`mission`** and **`product_thinking`** — Strategic alignment. Run the app, compare to stated mission, find the biggest misalignment. These require human judgment about direction and should never fire autonomously.

### Situational (not yet auto-injected)

**`close_session`** — Should fire automatically late in the day: commit uncommitted work, run quality gate, write handoff. The system knows the time; it should use it.

**`browser_test`** — Should fire after a run of UI-touching commits. The git log has enough signal: if the last three commits all touched components, a browser pass is warranted.

**`deploy_check`** — Should fire before any push to a production-tracked branch. The system knows the branch; it should know the policy.

## What Queue-Based Injection Actually Means

The queue isn't just a list of tasks. It's a channel for asynchronous human intent.

When you're watching a demo and notice a broken flow, you queue it from your phone. When a user reports a bug mid-session, you queue it from Control. When you're away and remember something important, you queue it. The queue is the interface between your thinking and the agent's execution.

This is why queue items get absolute priority over every auto-inject heuristic. The system's job is to execute human intent, not substitute for it. When the human has expressed intent, execute that. When the human hasn't expressed specific intent, use the heuristics.

The implementation is deliberately simple: the bash hook reads the queue atomically, dequeues the first item, injects it verbatim as the prompt, and removes it from the file. No wrapping, no context injection — the queue item is the prompt. If the user queued something vague, the agent will produce something vague. That's correct behavior; the queue should contain well-formed intents.

## What's Still Missing

The current system is better than what it replaced, but it's still shallow. Here's what the decision tree doesn't yet see:

**Velocity.** If the project has had zero commits in three days, something is blocking progress or the user has shifted attention. The system could detect this and switch from `next_best` (advance) to `orient` (understand why nothing is moving).

**Cross-session patterns.** If `session.next` has said "nothing urgent" for five consecutive sessions, the project is either done or stalled. The system should notice this pattern and surface it — not just keep injecting `next_best` into a project that has lost direction.

**Time of day.** `close_session` should fire automatically after 6pm when there's uncommitted work. `orient` should fire on Monday mornings after a weekend. These are predictable patterns the system already has the data to detect.

**Multi-item queue execution.** The current queue injects one item per session. If the user has queued three tasks, they run in three separate sessions — each with context load overhead, each with potential for mid-session derailment. A "queue drain" mode that executes items sequentially in a single session would be faster and more reliable.

**Inter-project coordination.** The system currently orchestrates within a single project tab. It has no awareness of what's happening across the fleet — whether the FleetCrown tab is blocked waiting on an API the OrangeCat tab is building, or whether two tabs are about to modify the same shared library.

## The Bigger Picture

The observation behind this is simple: the best prompt injected at the wrong moment is noise. `next_best` after a critical failure is counterproductive. `close_session` in the middle of a deep debugging run breaks flow. `orient` when the agent has perfect context and a specific task queued is waste.

FleetCrown's value isn't in having good prompts. Other tools have prompts. The value is in knowing which prompt, for which project state, at which moment — and executing that decision automatically so the builder never has to think about it.

Every prompt in the library is a policy. A policy that says: in this situation, with this context, do this kind of work. The orchestration layer's job is to read the situation and apply the right policy.

This is also why the prompt library needs to grow laterally, not just accumulate more entries. New prompts shouldn't be added because they're useful in the abstract. They should be added because there's a specific context — a health state, a velocity signal, a time of day, a project phase — where the existing prompts are wrong for the moment and a new one is right.

The measure of a good orchestration system isn't how many prompts it has. It's how rarely you have to override it.
