---
title: Every Ship, One Bridge
summary: Agent execution just detached from the laptop — and it detached in three directions at once. Your machine, a box you own, and now the provider's own cloud. The mistake would be to bet on one place. The captain's job was never to own the ship. It's to be the one bridge over all of them.
excerpt: Where the work runs is not who commands it. Execution now lives in three places, and each is good at a different job. The durable position is not a locus — it's the bridge across every locus.
publishedAt: 2026-07-08
tags: architecture,agents,strategy,execution
featured: true
author: Loki
readingTimeMin: 8
---

## The laptop stopped being the ship

For most of the agent era there was one honest answer to "where does the work run?" — on the machine in front of you. You opened a terminal, the agent read your files, ran your commands, and when you closed the lid it stopped. Execution and attention were the same place.

That coupling has broken, and it broke in three directions at the same time.

The first is **remote control of a local session**: the agent keeps running on your machine, but you drive it from your phone or a browser. Anthropic shipped exactly this — a Claude Code session runs locally and the web and mobile clients are just a window onto it. Nothing moves to the cloud; if the process stops, the session stops. It answers "steer from the couch," not "run without me."

The second is **provider-hosted execution**: the work runs on the vendor's own infrastructure, against a repo cloned from GitHub, in an ephemeral clean-room, and it keeps going with your laptop shut. Anthropic ships this too now — Claude Code on the web, and Routines that fire on a schedule, an API call, or a GitHub event, and open a pull request when they're done. Zero setup, provider-owned, one task at a time.

The third is **a machine you own that is always on** — a cheap VPS, a home server, a box in a rack. Not a clean-room clone: your real environment, your other repos, your local services, your credentials, persistent between runs. This is the one [the levelsio pattern](/thoughts/the-levelsio-pattern-productized-who-fleetcrown-is-for) describes people already building by hand, and the one [The Captain Needs a Ship](/thoughts/the-captain-needs-a-ship) argued FleetCrown had to be able to run on for its users, not just its founder.

Three loci. Same verb — "the agent runs somewhere that isn't the laptop I'm looking at" — three very different places.

## Locus is not command

Here is the distinction the whole thing turns on, and it is easy to miss because the surfaces blur it: **where the work runs is not who commands it.**

Remote control *feels* like cloud execution because you're driving it from your phone, but the compute is still your laptop. A Routine *is* cloud execution, but it's one account's one task in one repo. Neither of those is the thing a person running ten projects actually needs, which is: *see all of it, verify all of it, and govern all of it from one place, no matter where each piece physically runs.*

Provider-hosted execution answers "my laptop is closed." It does not answer "I have eleven agents across six projects and I need to know which ones are stuck, which produced work I can trust, and which one to move forward next." That second question is not a locus problem. It's a command problem. And a command problem does not get solved by picking a better place to run.

## Why betting on one locus is the wrong bet

The temptation, having watched execution detach, is to declare a winner — everything to the cloud, or everything on your own box. Both are wrong, because each locus is genuinely best at a different job:

- **The provider's cloud** is best at *zero-setup, disposable, single-task* work. Fire a Routine at a PR, get a review; hit an endpoint when an alert trips, get a draft fix. No install, no machine to keep alive. Its cost is that it is a clean-room clone of one repo — it can't see your other projects, your uncommitted state, your local services, or the environment you actually work in.
- **A box you own** is best at *real, persistent, multi-project* work. Your whole environment, always on, laptop shut. Its cost is that it is yours to run — you set it up, you keep it healthy.
- **Your laptop** is best at *right now, in the loop, full trust* — the work you're actively steering. Its cost is the lid.

A tool that forces one of these on you is optimizing its own convenience, not yours. The honest architecture treats the locus as a **property of the task**, chosen per dispatch, not a religion the product holds. [The model-agnostic layer](/thoughts/the-model-agnostic-layer) made this argument about *which mind* does the work. The same logic applies to *where* it runs: the labs will build gardens; the durable position is the gate that reaches all of them plus your own.

## What only the bridge can do

If the locus is swappable, then the thing that has to be constant is the layer above it. Across every place an agent might run — your laptop, your box, a provider's cloud — a captain's job is the set of things no single executor can do for itself:

- **See across the fleet.** One live picture of every agent in every project, whichever machine each one is physically on. A Routine's own dashboard shows you that Routine. It cannot show you the box-runner dispatch and the laptop session next to it.
- **Verify across model lineages.** Work judged by a *different* mind than the one that wrote it, so "done" means done. A single executor grading its own output is grading its own homework — structurally, its judge is itself. This is the one thing that gets *harder*, not easier, as execution scatters, because the verifier and the worker may now live in different clouds. It's also the thing worth owning. FleetCrown ships this today as the definition-of-done stop-gate.
- **Remember across projects.** Retrieval that spans the whole fleet, not one session's context window — the point of [The Fleet Remembers](/thoughts/the-fleet-remembers). A cloud task that clones one repo starts blind to the other ten.
- **Govern in one place.** Per-project autonomy, queues, handoffs, one injected bar for "what does finished mean" — applied uniformly no matter where the agent sits.

None of those are execution. All of them are command. That is the bridge, and it is the same bridge whether the ship underneath it is borrowed or owned.

## Honest status

FleetCrown commands two of the three loci today. Dispatch reaches your laptop through Fleet Runner, and it reaches a box you own through the headless runner — the same executor contract behind both, so a project you dispatch doesn't care which machine answers. Laptop shut, the box picks it up. That half is real and in daily use.

The third locus — provider-hosted execution, the Routines and cloud sessions the labs now run themselves — FleetCrown does **not** command yet. Every dispatch today is one it hands to a runtime it launched. Reaching a task that a provider scheduled and ran in its own cloud, and folding that run into the same fleet view, the same verification pass, the same activity log, is an edge of the bridge that isn't built. Naming it here is the point: it's the next span, not a shipped feature, and this essay is not going to pretend otherwise.

The strategy that has held since the start still holds, and it reads a little differently once you see three loci instead of one. **Borrow the workers, own the bridge** — the workers were always going to be borrowed; now their *ships* are too, some of them owned by the labs. That doesn't weaken the position. It sharpens it. When the place the work runs is a commodity anyone can rent, the only thing left worth building is the one place you command all of it from.

The captain needs a ship. It turns out the captain also needs to command ships it will never own. The bridge is what makes them one fleet.
