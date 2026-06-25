# Cross-Project Reference — spec

**Status:** proposed · **Date:** 2026-06-25
**Thesis fit:** This is the one context feature single-project tools structurally cannot have. FleetCrown's edge is that you run *many* projects; cross-project reference is where that edge becomes a feature.

## The problem with what exists today

Loki's composer has a project rail where you can tick **multiple** projects. But the wiring tells the real story:

- The API accepts `selectedProjects: string[]` (max 50).
- `resolveCommand` uses **only `selectedProjects[0]`**. Projects 2..N are silently ignored.

So the multi-select is an affordance that lies: it implies "act across these projects," does nothing of the sort, and gives no feedback that it didn't. That's worse than no multi-select. The instinct to rethink it is right.

## The core insight: two intents are fused into one control

Selecting multiple projects can mean two completely different things, and the current UI can't tell them apart:

1. **Target** — *where the work lands.* "Dispatch this task to kivvi." Inherently **singular** per dispatch (an agent runs in one project's session).
2. **Reference** — *what informs the work.* "Do kivvi's auth the way aoz-housing does it." Inherently **plural** — pull other projects in as context.

`selectedProjects[0]` accidentally implements Target and throws away Reference. The fix is not "use all N as targets" — it's to **split the two intents into two distinct mechanics**:

> **1 Target · N References.**

## Design (the recommended model)

### A. Reference-as-context — *lead with this*

In the composer, `@`-mention other projects: `@aoz-housing`. Each mention pulls that project's **profile** (mission, stack, architecture, conventions, definition-of-done — the block we already inject for the target) into the prompt as a clearly-delimited *"Referenced projects"* section, ahead of the task. Optionally pin specific files (`@aoz-housing/src/auth/*`) later.

Why `@`-mentions over a checkbox rail:
- **Disambiguated by construction.** The target stays the selected/named project; references are explicit, inline, visible in the text you wrote. No silent dropping.
- **Composable + precise.** "Do X here, like @a, but the data model from @b." A rail can't express that.
- **Familiar.** GitHub `#issue`, Notion `@page`, Claude's project reference — the gesture is learned.
- **Cheap to build.** Reuses `getProjectContext()` (the existing profile injector). Add `references: string[]` to the dispatch/ask payload; for each, inject the *summary-level* profile (not the full thing — token budget).

This is the uniquely-ours, on-thesis feature, and it's small.

### B. Fan-out dispatch — *power feature, defer*

"Run this on every project that uses Drizzle" → the same task dispatched to **N targets**. This is the legitimate multi-*target* case the old rail gestured at. It's a different, heavier feature (N sessions, N results to track, partial-failure UX) and should come later, as an explicit "Run on N projects" action — never the silent default of a multi-select.

### What changes in the UI

- The project rail becomes a **single-select Target** (radio, not checkbox) — honest about where the dispatch goes.
- References live **inline in the composer** via `@`, rendered as chips, removable.
- A future "broadcast" affordance (B) is a separate, explicit button — not the rail.

## Engineering

```
Composer: parse @mentions → references: string[]   (client)
   ↓
POST /conversations/:id/messages  { text, selectedProjects:[target], references:[...] , ... }
   ↓
messages route: resolveCommand(target) for routing (unchanged)
   ↓ build prompt:
   referenceBlock = (await Promise.all(references.map(getProjectContext)))
       .map(summarize).join() ;  prompt = referenceBlock + task
   ↓
injectPrompt / askLoki (reference block already folded into the prompt)
```

- **Reuse:** `getProjectContext()` already produces the profile block; add a `summary` mode (mission + stack + DoD only) so N references don't blow the context window.
- **Budget guard:** cap references (e.g. ≤4) and inject summaries, not full profiles. Log when truncated (no silent caps).
- **Authz:** only reference projects the caller owns / is a member of (same gate as the target).
- **Fan-out (B):** later — a loop enqueuing one dispatch per target, with a combined result view.

## Why this is the right stepping stone

The harness essay named **memory as our weakest strut**: a fleet should remember *more* than any one agent. Manual `@`-reference is the v1 of that — the operator hand-picks relevant cross-project context. The v2 is the harness *suggesting* references ("kivvi's auth resembles aoz-housing's — include it?") from similarity over the project profiles. Build the manual rail-to-mention path now; it's the substrate the automatic version grows on.

## Phasing

1. **Reference-as-context** — `@`-mentions → summary-profile injection; rail → single-select Target. (Small, high-value, on-thesis.)
2. **File-level references** — `@project/path` pins specific files into context.
3. **Suggested references** — similarity over profiles surfaces likely-relevant projects.
4. **Fan-out dispatch** — explicit broadcast to N targets with a combined result view.
