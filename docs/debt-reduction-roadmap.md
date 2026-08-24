# FleetCrown Debt Reduction Roadmap

---
created_date: 2026-05-21
last_modified_date: 2026-08-20
last_modified_summary: Linked the Captain's Refactor essay as strategic SSOT; added Phase 1 engineering checklist (submitCommand spine, run-event truth, UI honesty).
---

## Purpose

This document turns the current architectural concerns into an execution
roadmap for reducing code debt and making FleetCrown viable as a startup-grade
product.

**Strategic framing (public):** [The Captain's Refactor — Making the Bridge Real](/thoughts/the-captains-refactor-making-the-bridge-real) — codebase forensics, Grok Bot comparison, four-boundary refactor, phased build order. This doc remains the **engineering debt SSOT**; the essay is the narrative and acceptance framing.

The standard is no longer "works for me locally." The standard is:

- understandable by a new engineer
- auditable in production
- portable across users and machines
- adaptable across agent vendors
- cheap to extend without multiplying hidden complexity

## Debt Themes

The main debt is concentrated in four categories.

### 1. Split orchestration authority

The product loop is currently spread across:

- local hooks and `/tmp` signals
- Beacon desktop UX
- FleetCrown browser UX
- direct injection routes
- partial orchestration adapters

This creates duplicated behavior and weak ownership.

### 2. Claude-era semantics leaking into product logic

Examples:

- `claude-*` sentinel compatibility paths
- prompt-key compatibility mappings
- session handoff assumptions baked into route logic

These are acceptable as migration artifacts, not as architecture.

### 3. State assembled from multiple partial truths

Current state is inferred from:

- `/tmp` files
- process scanning
- session markdown files
- DB fallbacks
- latest orchestration run rows

That is survivable in migration, but expensive as a long-term model.

### 4. UI behavior duplicated across surfaces

The browser and Beacon both contain:

- prompt selection UX
- countdown behavior
- continue semantics
- state presentation logic

That should become one decision engine with multiple renderers.

## Operating Rule

The target architecture is:

- local runtime detects
- adapters translate
- FleetCrown decides
- UI surfaces render

Anything that does not fit that rule is debt.

## Delete

These are the things to remove as independent concepts.

### Delete independent prompt semantics outside FleetCrown

Why:

- prompt meaning must have one SSOT

Targets:

- direct prompt semantics embedded in Beacon file-reading logic in
  [scripts/beacon.py](/home/g/dev/fleetcrown/scripts/beacon.py)
- any remaining Claude-only prompt meaning outside
  [src/lib/orchestration/intents.ts](/home/g/dev/fleetcrown/src/lib/orchestration/intents.ts)

Action:

- Beacon may render prompt choices, but must not define prompt meaning

### Delete top-level route dependence on raw runtime semantics

Why:

- routes should not be the primary interpreter of local vendor artifacts

Targets:

- direct ready/closing/closed interpretation in
  [src/app/api/control/route.ts](/home/g/dev/fleetcrown/src/app/api/control/route.ts)
- direct prompt/run semantics in
  [src/app/api/inject/route.ts](/home/g/dev/fleetcrown/src/app/api/inject/route.ts)

Action:

- move interpretation behind orchestration state services and adapter ingestion

### Delete duplicated countdown authority

Why:

- only one place should decide auto-continue timing and default behavior

Targets:

- browser countdown in
  [src/components/control/project-card-helpers.tsx](/home/g/dev/fleetcrown/src/components/control/project-card-helpers.tsx)
- Beacon countdown logic in
  [scripts/beacon.py](/home/g/dev/fleetcrown/scripts/beacon.py)

Action:

- keep one policy engine; treat UI countdowns as renderers only

## Merge

These concepts exist more than once and should be unified.

### Merge prompt metadata and intent presentation

Current split:

- prompt config in [src/lib/agent-config.ts](/home/g/dev/fleetcrown/src/lib/agent-config.ts)
- orchestration intents in [src/lib/orchestration/intents.ts](/home/g/dev/fleetcrown/src/lib/orchestration/intents.ts)
- control button labels/groups in [src/config/control-intents.ts](/home/g/dev/fleetcrown/src/config/control-intents.ts)
- Beacon prompt metadata loading in [scripts/beacon.py](/home/g/dev/fleetcrown/scripts/beacon.py)

Problem:

- prompt text, prompt identity, intent identity, and UI grouping are related but split

Merge target:

- one canonical intent registry
- one adapter rendering layer for agent-specific prompt text
- one presentation config for UI ordering and labels

### Merge runtime state ingestion

Current split:

- fast-state reading in [src/lib/control-fast-state.ts](/home/g/dev/fleetcrown/src/lib/control-fast-state.ts)
- slower control aggregation in [src/app/api/control/route.ts](/home/g/dev/fleetcrown/src/app/api/control/route.ts)
- orchestration run persistence in
  [src/db/queries/orchestration-runs.ts](/home/g/dev/fleetcrown/src/db/queries/orchestration-runs.ts)

Problem:

- multiple code paths interpret the same project lifecycle differently

Merge target:

- one runtime-ingestion module
- one derived-state module
- one API response assembler

### Merge project identity handling

Current split:

- DB user projects
- projects conf parsing
- live tab alias resolution

Targets:

- [src/lib/agent-config.ts](/home/g/dev/fleetcrown/src/lib/agent-config.ts)
- [src/app/api/control/route.ts](/home/g/dev/fleetcrown/src/app/api/control/route.ts)
- [src/app/api/inject/route.ts](/home/g/dev/fleetcrown/src/app/api/inject/route.ts)

Merge target:

- project ID is canonical
- tab/session names are runtime bindings

## Stabilize

These are worth preserving, but they need firmer boundaries.

### Stabilize Beacon as a client, not a brain

Keep:

- the interruption UX
- always-on-top desktop overlay behavior
- fast decision surface

Do not keep:

- separate prompt authority
- separate orchestration semantics
- separate countdown decision logic

Target role:

- Beacon becomes a FleetCrown-controlled desktop client

### Stabilize adapter contracts

Keep building on:

- [src/lib/orchestration/contract.ts](/home/g/dev/fleetcrown/src/lib/orchestration/contract.ts)
- [src/lib/orchestration/adapters.ts](/home/g/dev/fleetcrown/src/lib/orchestration/adapters.ts)
- [src/lib/orchestration/runners/openclaw.ts](/home/g/dev/fleetcrown/src/lib/orchestration/runners/openclaw.ts)

Needed:

- explicit event ingestion contract
- explicit state derivation contract
- explicit close/continue capabilities

### Stabilize session handoff

Keep:

- the habit of forcing end-of-run summaries

Current locations:

- [src/lib/control-fast-state.ts](/home/g/dev/fleetcrown/src/lib/control-fast-state.ts)
- [src/app/api/sessions/route.ts](/home/g/dev/fleetcrown/src/app/api/sessions/route.ts)
- [src/lib/agent-config.ts](/home/g/dev/fleetcrown/src/lib/agent-config.ts)

Needed:

- one parser
- one writer contract
- structured summary artifact, optionally mirrored to markdown

### Stabilize control-panel rendering

Keep:

- the project card structure
- the lifecycle banners
- the operator affordances

Needed:

- render derived orchestration state, not inferred adapter truth

## Defer

These are useful, but should wait until the core architecture is cleaner.

### Defer broad multi-agent generalization

Do not build a speculative framework for many future vendors yet.

Reason:

- Claude, Codex, and OpenClaw already provide enough concrete needs

### Defer deep UI redesign

Do not spend cycles polishing visual redesigns until:

- orchestration truth is stable
- Beacon/browser duplication is resolved
- policy and event history exist

### Defer advanced portfolio automation

Examples:

- autonomous project prioritization
- budget-aware runtime scheduling
- cross-project queue optimization

These are valuable later, but they sit above unresolved state and policy debt.

## Ruthless Priorities

If time is limited, do these in order.

### Priority 1: Unify orchestration authority

Implement:

- one state model
- one event model
- one policy engine

Files to center:

- [src/lib/orchestration/contract.ts](/home/g/dev/fleetcrown/src/lib/orchestration/contract.ts)
- [src/lib/orchestration/intents.ts](/home/g/dev/fleetcrown/src/lib/orchestration/intents.ts)

### Priority 2: Introduce event log and derived state

Implement:

- orchestration events table
- ingestion from current `/tmp` and session signals
- state reducer

Result:

- raw runtime files become adapter inputs, not product truth

### Priority 3: Collapse prompt and intent duplication

Implement:

- one intent registry
- one UI metadata layer
- one adapter rendering path

Result:

- Beacon and FleetCrown render the same choices from the same source

### Priority 4: Reframe Beacon

Implement:

- Beacon reads FleetCrown-owned state/prompt/policy contract
- Beacon sends actions back through FleetCrown

Result:

- keep the good UX without keeping split product logic

### Priority 5: Remove route-level lifecycle interpretation

Implement:

- services for state derivation
- thinner API routes

Result:

- fewer bugs from inconsistent state assembly

## 30-Day Execution Plan

### Week 1

- define canonical orchestration event types beyond run rows
- add DB schema for orchestration events
- define one project runtime binding model

### Week 2

- build event-ingestion service for current local signals
- derive current control state from events plus live runtime facts
- refactor `/api/control` to consume derived state

### Week 3

- unify prompt/intents/presentation registry
- refactor control UI to consume unified intent metadata
- make Beacon consume the same prompt metadata contract

### Week 4

- move countdown/default-action policy into one backend-owned policy path
- make browser and Beacon render the same decision
- document remaining `dotfiles` responsibilities and remove semantic leakage

## File-Level Guidance

### Highest-risk files

- [src/app/api/control/route.ts](/home/g/dev/fleetcrown/src/app/api/control/route.ts)
- [src/app/api/inject/route.ts](/home/g/dev/fleetcrown/src/app/api/inject/route.ts)
- [src/lib/agent-config.ts](/home/g/dev/fleetcrown/src/lib/agent-config.ts)
- [src/lib/control-fast-state.ts](/home/g/dev/fleetcrown/src/lib/control-fast-state.ts)
- [scripts/beacon.py](/home/g/dev/fleetcrown/scripts/beacon.py)

Reason:

- these currently carry the most cross-boundary semantics

### Current extraction status

Implemented:

- `dotfiles` stop and notification hooks now delegate to
  [scripts/agent-hook-bridge.sh](/home/g/dev/fleetcrown/scripts/agent-hook-bridge.sh)
- shared runtime hook utilities now live in
  [scripts/agent-hook-lib.sh](/home/g/dev/fleetcrown/scripts/agent-hook-lib.sh)
- `dotfiles` Beacon now delegates to
  [scripts/beacon.py](/home/g/dev/fleetcrown/scripts/beacon.py)

Still a shim:

- `dotfiles` remains the place where Claude registers hook entrypoints
- `lib.sh` in `dotfiles` still exists as compatibility/runtime residue
- local hooks still perform direct Zellij injection instead of calling a fully neutral adapter API

### Good foundation files

- [src/lib/orchestration/contract.ts](/home/g/dev/fleetcrown/src/lib/orchestration/contract.ts)
- [src/lib/orchestration/intents.ts](/home/g/dev/fleetcrown/src/lib/orchestration/intents.ts)
- [src/db/schema/orchestration-runs.ts](/home/g/dev/fleetcrown/src/db/schema/orchestration-runs.ts)

Reason:

- these are already moving toward neutral orchestration concepts

## Decision Test

Before merging any change, ask:

1. Does this add a second source of truth?
2. Does this place product semantics in runtime glue?
3. Does this make Beacon and FleetCrown diverge more or less?
4. Does this make routes thinner or fatter?
5. Can a new engineer explain where the truth lives after this change?

If the answers move in the wrong direction, the change should not merge.

## Captain's refactor — Phase 1 checklist

Phase 1 from the essay: **honesty and convergence** — one dispatch spine, run
events as truth, no user-visible success without a run id. Concrete tickets:

| ID | Task | Primary files | Done when |
|----|------|---------------|-----------|
| P1-1 | Extract `submitCommand()` — single entry for Control, Loki, cron, widget | New `src/lib/orchestration/submit-command.ts`; thin `/api/inject`, `conversations/.../messages`, `kickFleet`, `nudge-idle` | All dispatch paths call one function; no duplicate run-create logic |
| P1-2 | Move run lifecycle transitions out of `inject-core.ts` tail into supervisor | `src/lib/orchestration/supervisor.ts` (new); shrink `inject-core.ts` to assembly + delegate | State transitions live in one module; routes do not mutate `ORCH_STATE` |
| P1-3 | UI status joins open run — ban tab-only "running" | `src/components/control/*`, `deriveProjectStateKey` consumers | Card "running" requires matching `orchestration_runs` row in `waiting`/`running` |
| P1-4 | Generate Loki capability preface from policy SSOT | `src/config/loki-capabilities.ts` (new); `loki-core.ts` imports | Adding a capability updates one config file; Loki text cannot drift |
| P1-5 | Audit user-flow **D** grades — gate or label | `docs/development/user-flow-audit.md`, `executor-copy.ts` | Every D-row has honest chip or route gate; hosted prod doc matches UI |
| P1-6 | Emit missing run events (`awaiting_approval`, `blocked`) | `src/db/queries/run-events.ts`, approval + block paths | Activity timeline shows approval/block without inferring from chat |

**Exit criterion:** dispatch → `run_events.dispatched` → terminal peek → close with verification — one traceable id, no zellij-specific failure modes on hosted default path.
