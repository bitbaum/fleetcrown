---
title: The Model-Agnostic Layer
summary: Every AI lab is building a walled garden. Cockpit is building the gate that connects all of them — and eventually the plot of land that lets you grow your own.
excerpt: Grok Build, Claude dispatch, ChatGPT Codex, Gemini CLI. The labs are racing to own the developer loop. Here is why that race produces the exact gap Cockpit fills.
publishedAt: 2026-05-18
tags: product,strategy,agents,dispatch,model-agnostic,hardware
featured: true
author: Ivy
readingTimeMin: 14
---
## The Race Nobody Asked For

In the span of a few months, every major AI lab shipped a developer-facing agent product.

xAI released Grok Build. Anthropic shipped Claude dispatch and cowork — a multi-agent coordination layer bolted onto Claude Code. OpenAI released ChatGPT's code agent alongside Codex as a programmable API. Google extended Gemini with a CLI and agentic IDE integration.

Each one is technically impressive. Each one is also, structurally, a trap.

The trap is not the capability. The capability is real and useful. The trap is the assumption embedded in the product design: that the model is the center of the universe, and everything else orbits it.

Grok Build assumes you want to stay in xAI's ecosystem. Claude dispatch assumes you want Claude handling orchestration, selection, and routing. Codex assumes you are an OpenAI subscriber who will stay one. Gemini CLI assumes Google knows which model you should use next.

None of them are wrong exactly. But all of them are partial.

A builder running five projects, three of which use Claude for reasoning-heavy work, one of which is a coding sprint that runs better on Codex, and one that runs a local model for privacy — that builder has no coherent control surface. They have five browser tabs, three CLI sessions, and a general sense that they are managing tools rather than executing work.

That is the gap. Cockpit fills it.

## What Cockpit Is Actually Building

Cockpit is not a Claude wrapper. It is not a better Codex UI. It is not an "AI assistant" in the consumer sense of that word.

Cockpit is the dispatch and orchestration layer that sits above every model, every agent runtime, every CLI tool — and presents one coherent interface to the builder operating them.

Think of it the way you think of a trading terminal. Bloomberg does not care whether you are buying Apple stock through Fidelity or Schwab. It gives you one surface to see positions, place orders, read signals, and execute decisions. The brokers are interchangeable. The terminal is the constant.

Cockpit is that terminal, for AI work.

The models are brokers. Cockpit is the terminal.

## The Fallback Chain

This is where the architecture becomes genuinely novel.

When you run an AI agent today, you make a bet. You bet that Claude has enough tokens left in your plan to finish the session. You bet that OpenAI's servers are not degraded. You bet that the model you chose is the right one for the work at hand.

Usually those bets are fine. Sometimes they are not, and when they are not, the cost is an interrupted session with no handoff. You lose state, you lose momentum, and you have to context-switch back into a problem you were making progress on.

Cockpit solves this with a priority chain.

You configure, once, the sequence of agents you trust: Claude first, then Codex, then Gemini CLI, then a local Mistral instance running on your machine. You assign each a role: reasoning, coding, fast responses, private work. You set capacity thresholds.

When Claude hits a token ceiling — real token exhaustion, not a soft limit — Cockpit detects it via the beacon. The agent stops. The beacon fires. Cockpit reads the exit state, reads the session transcript, packages a handoff prompt, and starts the next agent in the chain.

From your perspective: Claude stopped, Codex continued. You did not touch a terminal. You did not re-explain the problem. You did not lose context. The session persisted.

If Codex also exhausts or fails, the chain continues down. Gemini picks up. If Gemini is unavailable, the local model takes over. At each stage, the handoff prompt carries enough session context that the receiving model can orient itself and continue without intervention.

This is not a theoretical architecture. The beacon already writes the session state to disk. The executor already knows how to queue commands to the right agent. The plumbing is mostly there. What we are adding is the routing logic and the handoff protocol.

## Why Local Models Are Not Optional

Every AI lab has a reason to downplay local models. They are slower to set up, harder to fine-tune, and they compete directly with subscription revenue.

We have no such reason.

Local models belong in the fallback chain for a reason that has nothing to do with cost: privacy. There is a category of work — legal analysis, medical records, proprietary codebase review, sensitive business strategy — that should never leave a local machine. Not because the cloud providers are untrustworthy, but because the risk profile is fundamentally different when data leaves the device.

A builder who runs Claude for general work and a local Mistral instance for anything touching client data has a more defensible posture than one who sends everything to the cloud. Cockpit makes that split seamless: route by project tag, by file type, by sensitivity level. The builder does not need to think about it once the rules are set.

Beyond privacy, local models are increasingly capable. Mistral 7B, Llama 3, Gemma 2 — all of them run on consumer hardware and handle the majority of coding and reasoning tasks that developers actually do day-to-day. The gap between a good local model and a frontier API call is narrowing every quarter.

The builder who knows how to run a local model today is ahead of the builder who discovers this in eighteen months when the economics of frontier APIs become uncomfortable.

Cockpit will make this obvious. Setup guides, one-click configuration, hardware recommendations. Not as an afterthought — as a first-class feature with clear UX.

## The Hardware Layer

The logical end of the local model story is hardware.

If you want to run a useful local model today, you need a machine with a capable GPU. Most developers do not have one. Most developers do not know which one to buy, how much VRAM matters, which models are quantized well enough to fit on what.

This is a solvable problem with good curation and clear communication.

The near-term version is simple: we recommend specific machines. A tier for experimentation — a consumer GPU that runs Mistral comfortably. A tier for serious work — something that handles a 30B model at reasonable speed. A tier for the builder who wants to match frontier performance locally — a workstation-class setup that covers 70B models.

We document the setup precisely. Not vague tutorials — exact commands, exact models, exact configuration. You buy the machine we recommend, follow the guide, and within an hour you have a local model in your Cockpit fallback chain.

The medium-term version is a curated hardware bundle. A machine pre-configured with the right drivers, the right model weights, and Cockpit pre-installed. Plug it in, power it on, it joins your fleet. No setup friction. It shows up in your Control panel like any other agent slot.

The long-term version is a machine we design. Not because the hardware itself is the point — it is not — but because the integration is. A computer designed from the ground up to run AI workloads locally, with Cockpit as the OS-level control layer, with the fallback chain built into firmware, with hardware-level session persistence so that if power is cut mid-session the agent state survives the restart.

This is not a fantasy. Apple builds hardware and software together because the integration produces an experience neither can produce separately. The same principle applies here: a Cockpit machine is not a PC that happens to run Cockpit. It is a device where the hardware, the agent runtime, and the dispatch layer are designed as a unit.

## Against the Walled Garden

Let us be precise about what we are opposing.

We are not opposed to Anthropic. Anthropic makes the best general-purpose reasoning model available today. Claude is in the default position in every Cockpit chain and will be for the foreseeable future.

We are not opposed to OpenAI. Codex is a capable coding agent and the API is well-designed. It belongs in the chain.

What we are opposed to is the structural incentive that pushes every lab toward lock-in: the assumption that their model should be the center of the builder's world.

That assumption produces bad UX. It produces duplicated context-switching. It produces the current situation where builders managing multiple models manage them as separate worlds rather than as a coherent fleet.

The walled garden is not a conspiracy. It is a consequence of business incentives: each lab benefits when you route more work through them. Cockpit's incentive is different. We benefit when you route work correctly — to whichever model is best suited for the task, regardless of provider. That alignment is the product.

## Simpler and More Powerful, Together

The phrase "simpler and more powerful" usually describes a tradeoff that was resolved in favor of simplicity. A feature was cut. A capability was hidden. Power users lost something.

That is not the tradeoff here.

Simpler means: one interface, not five. One configuration file, not a separate setup per CLI tool. One session state, not one per model. The builder sees one Control panel, one beacon, one fallback chain. The complexity lives in the routing layer, not in the builder's head.

More powerful means: the full capability of every model, accessible from that one interface. You are not constrained to Claude's web UI or Codex's API. You can use Claude for reasoning, Codex for code generation, Gemini for fast iteration, and a local model for sensitive work — all in the same session, with seamless handoff between them.

The simplicity and the power are the same thing. The builder does not manage complexity by becoming simpler themselves. The system becomes capable of managing complexity on the builder's behalf.

This is the only kind of simplicity worth building. The kind that does not cost capability.

## What This Means for the Builder

Concretely, here is what the Cockpit model-agnostic layer means for a builder running it:

Your morning session starts. Claude is your primary agent. You dispatch it to a coding task from the Control panel. It runs for two hours, commits code, raises a question, stops. The beacon fires. You review the session, inject a continue prompt, it runs another hour.

Late morning, Claude's session context is getting long. It slows slightly. Cockpit notices session depth and surfaces a warning. You set a threshold in settings: if session tokens exceed eighty percent of Claude's context window, offer to start fresh on Codex. You accept. Cockpit packages the last five commits, the open file, and the current task description into a handoff prompt. Codex opens in your Zellij session. Continues from exactly where Claude left off.

Afternoon. You switch to a project that involves reviewing a client's proprietary data. The project tag says "private." Cockpit's routing rules see the tag and automatically assign the local model for this project. No cloud. No data leaves the machine. You work the same way you always do — dispatch from Control, beacon fires when ready, inject to continue — but the execution happens locally.

End of day. You are in the middle of something. Your frontier model subscriptions are both rate-limited — you hit a heavy day. The local model picks up. Slower, but it finishes. No session lost.

That is the product. Not a chatbot. Not a better terminal. A fleet management layer that makes the builder more powerful without making their environment more complex.

## The Bigger Picture

The AI industry is three years into a period of explosive capability growth and roughly eighteen months into figuring out what the right product surface is.

Every lab is converging on similar answers: agents that can write code, agents that can use tools, agents that can be orchestrated together. The differentiation is moving from "what can the model do" toward "how does the builder interact with it."

That is the right place for Cockpit to be.

We are not betting on one model winning. We are betting that the right abstraction is above the model layer — that the operator interface, the dispatch logic, the session persistence, the fallback chain — these are the durable parts of the stack.

Models will get better. Prices will change. New providers will emerge. Local hardware will improve. Some labs will consolidate; others will open-source their weights. All of that will happen.

Cockpit's job is to make none of that matter to the builder. New model comes out — add it to the chain. Price drops on Codex — rebalance the routing. Local model improves — promote it in the priority list. The builder's workflow does not change. The fleet adapts underneath it.

This is the right bet. Not because we are certain about how the AI landscape shakes out. But because whatever happens, there will be builders who want to use multiple models, across multiple projects, with the least possible cognitive overhead. That demand is structural. It comes from the nature of the work, not from a particular model's feature set.

Cockpit is the product that earns that builder's trust — and keeps it, regardless of which model they are trusting today.
