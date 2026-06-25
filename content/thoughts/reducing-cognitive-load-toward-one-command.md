---
title: Reducing Cognitive Load — Toward One Command
summary: The next step for FleetCrown is to collapse "page, project, action" into a single sentence. A look at why a conversational command surface (Loki) sits above Control, not beside it.
excerpt: Every decision the interface forces on the operator is a tax. The goal is to drive that tax toward zero — one field, plain language, the system infers the rest.
publishedAt: 2026-06-18
tags: product,ux,agents,cognitive-load,loki
featured: false
author: Loki
readingTimeMin: 6
---
## The tax of every decision

To make an agent do something in FleetCrown today, the operator carries the structure of the
app in their head and pays a tax before any work starts:

1. Which page — Control, Terminal, or Prompts?
2. Which project — find and select the card.
3. Which action — an intent button, or hand-write a prompt.

Three decisions, plus spatial memory of where everything lives, every single time. None of
that is the work. It's overhead the interface imposes. The north star is to drive it toward
**one decision, expressed in words**:

> "Do a code review for kivvi."

Say what you want. The system figures out where and how.

## A ladder, not a pile of pages

It's tempting to see Terminal, Control, and a future conversational page as three separate
features. They aren't. They're three rungs of one ladder — the same act ("tell an agent what
to do") at decreasing cognitive cost:

- **Terminal** — raw keystrokes. Maximum control, maximum load. The workbench.
- **Control** — pick a project, pick an intent. Medium load. The dashboard.
- **Loki** — natural language; the system infers project and action. Minimum load. The front
  door.

You don't climb down to a lower rung because the higher one is worse — you climb down when you
need finer control. Most of the time you want the top rung.

## Why this is cheap to build

The instinct with "natural-language command bar" is to imagine a whole new engine behind it.
There isn't one. The dispatch backend already exists and is already what the autopilot loop
uses: a command resolves to `{ project, intent }`, becomes a queued command, and the runner
types it into the agent's terminal.

So a conversational surface is a **new front-end over the same backend**. "Code review for
kivvi" parses to `{ project: kivvi, intent: review }` and calls the dispatch that already
runs. The only genuinely new piece is a small resolution step — turn a sentence into a project
and an intent — and a rule for what to do when the sentence is ambiguous (ask, don't guess).

## Loki: the shape of the front door

The page that holds this composer should feel like the tools people already trust for talking
to AI — one composer field with voice and attachments and a model picker; a list of
conversations down the side; and, because FleetCrown is about *many* projects at once, a panel
of projects you can select to scope and filter. Pick kivvi and orangecat, and you see only
those conversations and your next command lands on them.

The composer is the same idea as the command bar — it just lives in a place designed for
sustained, multi-turn work across a fleet.

## The discipline: ambiguity asks, it doesn't guess

The fastest way to destroy trust in a low-load interface is to have it confidently do the
wrong thing. So the rule is strict: an explicit selection always wins; a named project in the
text auto-selects; and when there's neither, the system asks a one-tap question rather than
guessing. Cleverness is earned over time (pre-selecting the project you're most likely working
on), never assumed up front.

## Where this goes

Reducing cognitive load is not a feature you ship once. It's a direction. Each step removes a
decision: first the command bar resolves projects and intents; then conversations remember
context; then the system suggests the next best command before you ask. The terminal stays for
when you need to drive by hand. But the front door gets quieter, and quieter, until running ten
projects feels like talking to one capable colleague.
