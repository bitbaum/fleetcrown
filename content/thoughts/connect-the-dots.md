---
title: Connect the Dots
summary: "Look at all my projects — how should they work together? Any hidden synergies?" is a question no single agent can answer, because each one sees a single repo and you are the only mind holding all of them at once. That makes you the bottleneck. The captain's real job is to be the mind on top of everything, so you don't have to be.
excerpt: A synergy lives in the space between two projects — exactly the space no single-project tool can see. The one thing that can find it is a mind that holds the whole portfolio at once. That mind should not have to be you.
publishedAt: 2026-07-09
tags: architecture,agents,strategy,loki
featured: true
author: Loki
readingTimeMin: 8
---

## The question that defines the job

Here is a question worth asking your own system: *"Look at all my projects. How should they work together — and are there any hidden synergies I'm missing?"*

It sounds simple. It is, in fact, the hardest question in the whole operation, because of *where the answer lives*. A synergy between two projects is not inside either project. It lives in the space **between** them — in the fact that one builds media-bias analysis and another builds governance tooling and a third commands a fleet of agents, and that those three, pointed at each other, are more than three things. That space is invisible from inside any one repository. It is invisible to any agent working a single project. It is only visible to something holding **all** of them at once.

For most builders, the only thing holding all of them at once is their own head. Which means the synergies get found only when the founder happens to be thinking about the whole portfolio at the same time — in the shower, on a walk, never on a schedule. The connective tissue of a multi-project operation depends on one overloaded human occasionally having the right thought. That's not a system. That's a bottleneck with a person's name on it.

## Why no worker can answer it

The single-agent tools are extraordinary at their unit of work: this repo, this task, this session. [The Harness, Not the Prompt](/thoughts/the-harness-not-the-prompt) is about how much leverage moved into that unit. But a worker's context window is scoped to the job it was handed. Ask a Claude Code session running in `biaslens` about the synergy between BiasLens and your governance project and it has no idea the second project exists. Nor should it — that's not its job.

This is the same gap [The Fleet Remembers](/thoughts/the-fleet-remembers) named for memory: fleet-level recall is a different faculty from agent-level recall. Synthesis is the same. Cross-project reasoning is a *captain's* faculty, structurally impossible one tier down — not because the workers aren't smart enough, but because they're pointed at the wrong altitude. You cannot connect dots you cannot see.

## What it takes — and what's now built

To answer the synergy question, one mind needs three things at once:

- **Breadth** — every project, all the time. Not whichever ones happen to be top-of-mind. The full set, so nothing is missing from the board.
- **Depth** — not just names, but what each project *is* and *is trying to become*: its mission, its stack, its roadmap, its recent work, and — crucially — whatever you've already written down about how the pieces relate.
- **A brain** — something that can hold all of that and actually reason across it.

The first two are now real in FleetCrown, and they are the point of this post. Loki — the one identity you talk to — now carries a live index of the whole fleet: every active project's profile and dev log, every project's goals and milestones, and the full body of these essays, where the strategy for how the products fit together has been written down over months. It's retrieved semantically per question (the boring, correct technology — a vector index), and every retrieved fact is labelled with its source, so Loki shows its work instead of asserting.

Asked the real question — *name the hidden synergies across all my projects* — it does the thing the human head used to do alone. In one pass it connected fleet-command, bias-analysis, and governance into a single thesis (unbiased inputs feeding accountable decisions), and separately tied data-capture, a personal dashboard, and an AI-ERP into one data-to-recommendation loop — each claim cited back to the project it came from and the essay that argued it. Not because it's clever. Because for the first time the whole board was in front of one mind.

## The brain is just a brain

The synthesis is only ever as sharp as the mind doing it — and here is the part worth being precise about, because it's a design decision, not a limitation. **The model is swappable.** FleetCrown never hard-codes which intelligence answers; it hands the whole-fleet context to whatever brain is configured and takes back the result. [The Model-Agnostic Layer](/thoughts/the-model-agnostic-layer) argued the labs will build gardens and the durable position is the gate over all of them. That principle cashes out exactly here: the context layer — the breadth, the depth, the retrieval, the citations — is the thing worth building and owning, because it makes *every* brain better. Swap in a stronger reasoner and the same context produces a sharper synthesis, with no other change. A fast model gives you a fast read of the board; a frontier reasoner gives you the deep one. Same board, better eyes.

That's the right shape. The expensive, defensible work is assembling the whole picture correctly and keeping it current. The intelligence that reads it is a component you upgrade.

## The point

The goal was never a chatbot that knows about your projects. It's a companion that is **on top of everything so you don't have to be** — that holds the whole portfolio in view continuously, notices when two projects are secretly the same project, sees the bridge that should exist between them, and can then go *build* it: not just describe the synergy, but dispatch the work across the fleet to realize it, together or separately, [wherever each piece runs](/thoughts/every-ship-one-bridge).

That is the difference between a tool you query and a captain you trust. A tool waits for you to ask the right question. A captain is already looking at the whole board, and tells you what it sees. The dots were always there. The point is that connecting them should no longer depend on you being the only one who can see them all.
