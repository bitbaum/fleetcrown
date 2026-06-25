---
title: What a Truly Agent-Agnostic Popup Architecture Needs
summary: The concrete architecture needed to make Beacon and FleetCrown lifecycle-driven instead of Claude-driven, with a clear split between adapters, control plane, and clients.
excerpt: Agent-agnostic does not mean every backend works the same way internally. It means every backend can be translated into the same system-level lifecycle semantics.
publishedAt: 2026-05-06
tags: architecture,orchestration,beacon,control-plane
featured: false
author: Loki
readingTimeMin: 13
---
## Agent-Agnostic Does Not Mean Internally Identical
Different backends will keep having different mechanics.

Some are interactive CLIs.
Some are managed one-shot runners.
Some are durable orchestrators.
Some are only provider layers.

Agent-agnostic does not mean forcing all of those into identical internal behavior. It means translating them into the same external lifecycle semantics so the surrounding system behaves consistently.

## The Lifecycle Contract
The first requirement is a neutral lifecycle vocabulary.

For example:

- `task_started`
- `task_progressed`
- `input_requested`
- `continue_requested`
- `close_requested`
- `task_completed`
- `session_closed`
- `task_failed`

The exact list can change, but the principle cannot: the meanings must be owned in one place.

## The Three Layers
The architecture needs three clean layers.

## Execution Adapters
Per-agent adapters are responsible for:

- launching sessions
- injecting or running work
- detecting completion or waiting if possible
- translating runtime-specific behavior into neutral lifecycle events

They should not own product semantics.

## Session Control Plane
FleetCrown should own:

- lifecycle state
- handoff summary persistence
- continuation action meaning
- popup eligibility
- session-level truth across desktop and browser views

This is the layer that must be model-neutral.

## Presentation Clients
Beacon and the browser should both render the same state.

That means:

- Beacon should not be the brain
- the browser should not invent separate lifecycle logic
- both should be clients of shared session state

## The Practical Paths Per Backend
Not every backend needs the same implementation strategy.

Useful categories are:

- interactive session adapters
- managed one-shot task adapters
- durable background orchestration adapters
- provider-only backends

Popup behavior is likely essential for the first two, optional for the third, and meaningless for the fourth.

That still counts as agent-agnostic because the contract stays explicit.

## The Wrong Fixes To Avoid
There are four bad patterns worth avoiding.

## Special-Case Every Backend
If each new agent gets a different popup hack, the system will accrete exceptions instead of architecture.

## Scrape Terminal Output As The Foundation
Terminal scraping may be a fallback, but it is not a reliable source of lifecycle truth.

## Put Semantics Inside Beacon
Beacon should render state and return actions. It should not decide what `continue`, `close`, or `done` mean.

## Confuse Providers With Runtimes
Providers such as OpenRouter or Anthropic APIs do not own session lifecycle. Runtimes do.

## What Success Looks Like
The finished system should let a user:

1. launch a project with any supported agent
2. run work
3. leave the machine
4. return when the session reaches a decision point
5. see the same popup semantics
6. continue, redirect, or close without caring which runtime is underneath

If that holds, the popup belongs to FleetCrown.

If it does not, the popup still belongs to one adapter.

## The Bottom Line
The path to a truly agent-agnostic popup is not “make every backend act like Claude.”

It is:

- define lifecycle semantics once
- let FleetCrown own them
- reduce Claude to one adapter among several
- make each backend emit or map into that lifecycle contract
- keep Beacon and the browser as clients of shared state

That is the architecture that scales.
