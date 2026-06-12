---
title: "One Button: Play and Pause the Fleet"
summary: The end state FleetCrown is built toward — describe what you want, press play, and watch the fleet build it. Pause anytime. No forms, no supervision.
excerpt: The interface for building everything should look like a media player. Play means the fleet works on your projects. Pause means it stops. Everything else is context.
publishedAt: 2026-06-12
tags: vision,autopilot,context,product
featured: true
author: Ivy
readingTimeMin: 6
---
## The Interface Is a Media Player

The end state FleetCrown is built toward is embarrassingly simple to describe:
you log in, you see your projects, and there is one button that looks like
play. Press it, and development happens — across every project at once.
Press it again, and it pauses. That's the whole interface.

One play/pause for the fleet. One play/pause per project. Everything else —
agents, prompts, queues, sessions, git state — is machinery behind that
button, and machinery should not demand supervision.

Today that button exists. "Build all" opens the auto-injection gate for every
project; the per-project toggle overrides it in either direction. When the
gate is open, the autopilot keeps dispatching the next best action for each
project. When it's closed, nothing fires. The media-player semantics are
real, not a metaphor.

## A Project Is a Container for Intent

For one button to be enough, the system has to already know what each
project is *for*. That knowledge lives in the project profile: what it is,
who it serves, where it's going, what's next. The profile is not
documentation — it is the input that decides what the fleet does when you
press play.

A project can be a website. It can be software. There is no reason the same
shape can't eventually hold "build a Versailles-like mansion" or "cure
cancer" — a container for intent, with the fleet responsible for decomposing
it into actions: design, materials, financing (that's what OrangeCat is
for), finding the people and the machines, coordinating the work. The
software fleet is the first instance of the pattern, not the limit of it.

## Nobody Fills Out Forms

The failure mode of every context system is the form. Fields named
"mission" and "vision" that nobody fills in, so the system that depends on
them runs blind.

So FleetCrown doesn't ask. You describe the project in your own words —
typed, pasted, or spoken — and AI sorts it into the profile. Or you point at
the repo, and the README and CLAUDE.md become the profile. The fields exist
for the machine; humans speak freely. The same extraction pipeline backfills
every project that already has a repo, because a profile should never be
emptier than the codebase it describes.

## You Have to See It Working

A button that silently "does development" earns no trust. The other half of
the product is making the work legible: what was just done, what is being
done now, what will be done next — and how each of those moves the project
toward what its profile says it should become.

That is what the unified activity ledger is for: every dispatched prompt,
every run outcome, every commit, one timeline per project and one for the
fleet, with digests that compress a day of fleet work into something you
read in thirty seconds. Past prompts are one click from being sent again.
History is not a log file; it is the proof that pressing play meant
something.

## Why This Matters

Most people have more projects than time, and the bottleneck is not ideas —
it is supervision. Every project that needs you to babysit it is a project
that competes with every other one. A fleet you can play and pause removes
the supervision tax. You hold the intent; the fleet holds the execution.

Build that well enough for software, and the same control surface extends to
everything humans build. That is the point of FleetCrown: one person, any
number of projects, one button.
