---
title: Why Claude Gets the Popup and Other Agents Do Not
summary: A precise breakdown of why Claude currently triggers Beacon while Codex, Gemini, OpenClaw, and provider-layer systems like OpenRouter do not.
excerpt: The difference is not model quality. The difference is whether a runtime emits the lifecycle events that the popup system actually depends on.
publishedAt: 2026-05-06
tags: agents,claude,codex,gemini,openclaw,openrouter
featured: false
author: Loki
readingTimeMin: 10
---
## The Important Distinction
The popup does not depend on “which model is smart enough.” It depends on which runtime emits the lifecycle events that FleetCrown and Beacon need in order to know a session has reached a stopping point.

That is why Claude works today.

## Why Claude Works
Claude is currently the only interactive runtime in this setup that is wired into a real stop path.

The chain is:

1. Claude finishes a turn.
2. Claude fires a local hook.
3. The hook runs the bridge script.
4. The bridge writes lifecycle state and launches Beacon.
5. Beacon renders the continuation UI.

That is enough to create a real loop.

## Why Codex Does Not Behave The Same Way
Codex can launch and accept work, but the interactive local session path does not currently emit an equivalent “finished and waiting” event in this setup.

So the system can know:

- Codex is running
- Codex received a prompt

But it cannot reliably know:

- Codex has reached the point where the popup should appear

That is the missing piece.

## Why Gemini Does Not Behave The Same Way
Gemini is even less integrated. Detection of a CLI is not the same thing as orchestration. Without prompt flow, lifecycle emission, and continuation routing, the agent is not participating in the same operating loop yet.

So the absence of popup support here is not surprising. It is simply unfinished integration.

## Why OpenClaw Is Different
OpenClaw is better thought of as a runner or orchestrator backend than as a terminal-native interactive session loop.

It can:

- run tasks
- finish tasks
- persist run results
- produce summaries

But unless completion from OpenClaw is translated into the same waiting or completion event that Beacon expects, it will not feel equivalent to Claude from the operator’s point of view.

So OpenClaw is not the same problem as Codex. It does not need the same implementation path. It still needs the same system semantics.

## Why OpenRouter Is A Different Category Entirely
OpenRouter is a provider abstraction, not a local session runtime.

That means OpenRouter itself does not have a popup path. A client or runtime using OpenRouter would need to emit session lifecycle events. Without that, asking whether OpenRouter “supports the popup” is the wrong question.

The right question is:

> Which runtime is using OpenRouter, and does that runtime participate in the FleetCrown lifecycle contract?

## The Better Way To Phrase The Problem
The wrong question is:

> Which models support the popup?

The correct question is:

> Which session runtimes emit the lifecycle events that FleetCrown needs to drive the popup?

That wording forces cleaner architecture and avoids mixing up:

- model
- provider
- runtime
- orchestration layer

## The Bottom Line
Claude gets the popup because Claude is the only runtime in this setup with a fully wired lifecycle callback path into Beacon.

Codex, Gemini, OpenClaw, and OpenRouter do not all fail for the same reason, but they all currently miss the same product outcome: they are not yet participating in a neutral, shared session lifecycle that drives the continuation loop.
