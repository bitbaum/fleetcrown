---
title: The Play Button Is the Product
summary: One click that looks like play should be enough to have all your projects built without supervision. Why FleetCrown's autopilot became a play/pause button, and why project context had to stop being a form.
excerpt: The cognitive load of building is not the building. It is deciding, again and again, that building should continue. A play button removes that decision. A pause button gives it back.
publishedAt: 2026-06-12
tags: autopilot,control,ux,context,vision
featured: true
author: Loki
readingTimeMin: 7
---
## The end state

The ideal interaction with FleetCrown is one sentence and one click. "I want a Versailles-like mansion." "I want this SaaS shipped." "I want cancer cured." The sentence sets the destination; the click — a button that looks like play — means *go build it, and don't make me supervise*. The same click, now showing pause, means *stop everything, I want to think*.

Everything between today's FleetCrown and that end state is implementation detail: agents that write code now, agents that hire labs and coordinate robots later. The interaction model doesn't change. What changes is how much of the world the fleet can reach.

## What shipped today

Autopilot in FleetCrown was already binary — on or off, globally and per project — after the mode collapse earlier this month. But the controls still looked like settings: a dropdown in the fleet header, another dropdown on every project card, a radio group buried in Settings. Functional, and completely wrong emotionally. Nobody feels "all my projects are being built" when they pick `on` from a select element.

So the controls became what they always were underneath:

- The fleet header now has one button. Paused fleet: **▶ Build all**. Building fleet: **⏸ Pause all**, with a pulsing dot that the live working counters corroborate. It is the one primary action on /control.
- Every project card has the same button in miniature. **Building** or **Paused**, click to flip. When a project diverges from the global state, a small "override · follow global" affordance puts it back in formation.

The safety rails did not move: status:working, blockers, the no-op fuse, and health gates still decide whether a dispatch actually fires. Play does not mean reckless. It means *the default is forward*.

## Context is the fuel, and forms are a terrible pump

A fleet that builds without supervision needs to know what it is building toward. That is the project profile: mission, vision, customers, stack, next step. And here was the embarrassing part — most profiles in FleetCrown were nearly empty, including FleetCrown's own, while the same information sat in every README and CLAUDE.md of every repo. The product asked humans to retype what machines already knew, one field at a time, through a form. People hate forms. So people don't fill them. So the fleet flies blind.

Today that pipeline inverted:

- **Describe it.** On any project, write — or dictate — what the project is and should become, in free form. The model sorts it into the profile fields. The form still exists, but only as the editing surface for what the AI filled.
- **Fill from repo.** One click reads the linked repo's README and CLAUDE.md and fills the profile from them. The repo was already the source of truth; now the profile admits it.

Both paths write to the same single source of truth the manual editors use, so a wrong extraction is one click from corrected — and the dispatch layer, the digests, and the strategist all see the same context the human sees.

## Why this ordering matters

It would have been easy to chase the grand version first — financing through OrangeCat, robots, labs. But the play button is only honest if pressing it does something real today, and what it does today is dispatch agents against projects whose context is rich enough to act on. Static context (what this project should become) plus dynamic context (what just happened, what is queued) is the entire information diet of an autonomous fleet. Today's work fattened the static half and made the on/off decision feel like what it is: the only decision the captain should have to make.

The mansion and the cure are not features to build later. They are the same button, pressed in a world with more actuators.
