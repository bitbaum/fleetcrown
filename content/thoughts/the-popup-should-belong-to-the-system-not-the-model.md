---
title: The Popup Should Belong to the System, Not the Model
summary: Why a continuation popup is a lifecycle feature of FleetCrown itself, not a Claude feature, and why the current behavior proves the control plane is still too vendor-shaped.
excerpt: If the popup only appears for Claude, the product is not agent-agnostic yet. The popup belongs to the session control plane, not the model runtime.
publishedAt: 2026-05-06
tags: architecture,beacon,fleetcrown,lifecycle
featured: false
author: Loki
readingTimeMin: 11
---
## The Real Requirement
The requirement is not “make Beacon appear for Codex too.”

The requirement is stricter than that: the popup must be a capability of FleetCrown itself, not a side effect of whichever model runtime happens to expose the most convenient hooks first.

That distinction matters because the popup is not cosmetic. It is the handoff point in the execution loop. It is where a running session turns back into an actionable decision:

- continue the work
- redirect the work
- close the session
- write a custom prompt

If one agent gets that loop and another one does not, then the system is not neutral yet. It is still expressing product truth through one privileged integration.

## What The Popup Actually Means
The popup should not be understood as “the Claude popup” or “the Codex popup.”

It represents a semantic transition:

- work was running
- the agent reached a stopping point
- the system now needs the next instruction

That is a system event, not a model feature.

Once that is clear, the architecture becomes clearer too. The model runtime is responsible for execution. The system is responsible for:

- session lifecycle
- continuation choices
- session handoff state
- operator notification
- persistence of what just happened

The popup belongs to that second category.

## What The Current Behavior Proves
Claude gets the popup. The others do not.

That does not prove Claude is the “right” agent or the only one capable of participating in the loop. It proves something narrower and more important:

Claude is currently the only runtime in this setup that is fully wired into the lifecycle system that drives Beacon.

That means the popup is not truly agent-agnostic yet. It is Claude-shaped infrastructure wearing a more general UI.

## Why This Is A Bigger Problem Than It Looks
When the popup only appears for one runtime, users learn a hidden truth about the product:

- one path is first-class
- other paths are partial

Even if the control panel lists multiple agents, the real operator experience is not equal. The session with the best continuation loop becomes the session users trust most.

That creates product gravity:

- Claude feels operationally complete
- Codex feels partly integrated
- other backends feel secondary or experimental

That is why this is not just a notification bug. It changes how people route serious work.

## Where The Popup Should Live
The popup should live at the session control-plane layer.

That means FleetCrown should own the meaning of:

- running
- waiting
- continue requested
- close requested
- session closed
- handoff summary available

Beacon should render those states. The browser should render those same states. Neither should have to invent them independently.

If the popup only works for Claude, then some of that meaning is still stuck inside the Claude-specific integration layer instead of the shared system layer.

## The Standard To Hold
The standard is simple:

- if an agent can run work but cannot participate in the continuation loop, it is not first-class yet
- if the popup only appears for one agent, the popup is not architecture-level yet
- if Beacon and FleetCrown derive lifecycle state differently, the control plane is split

That is the standard to design toward.

## What Success Looks Like
Success is not merely that the popup appears more often.

Success means:

1. any FleetCrown-managed session can enter the same neutral “waiting for next instruction” state
2. that state is persisted independently of the underlying model runtime
3. Beacon reacts to it consistently
4. the same continuation choices are available regardless of agent
5. the session summary stays attached to the session rather than to one vendor integration

If that is true, the popup belongs to the system.

If it is not true, the popup still belongs to one backend.

## The Bottom Line
The popup should belong to the system, not the model.

Right now, Claude has popup behavior because Claude is the only runtime in this setup with a fully wired lifecycle path into Beacon. That is useful progress, but it is not the target architecture.

The target architecture is a FleetCrown-owned session lifecycle that any agent adapter can participate in. Once that exists, the popup stops being “Claude support” and becomes what it should have been all along: part of the operating model of the system itself.
