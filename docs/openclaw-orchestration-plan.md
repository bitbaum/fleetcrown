# OpenClaw-Native Orchestration Plan

## Purpose

Replace the current Claude-centric prompt loop with a neutral orchestration layer that can drive project work through OpenClaw first, while keeping Claude as an adapter instead of the architecture.

This document is the SSOT for the OpenClaw-oriented migration path.

For the broader governing rules, invariants, and phased architecture plan,
see [architecture-first-principles.md](./architecture-first-principles.md).

## Problem

Today, the highest-value project acceleration loop lives in a Claude-shaped local runtime:

- prompt intents live in Claude prompt files
- session lifecycle signals are Claude-specific
- state files are Claude-specific
- FleetCrown reads Claude session state directly
- Codex is only partially integrated
- OpenClaw is powerful, but not the orchestrator of this workflow

That creates the wrong dependency:

- when Claude credits run out, the best orchestration experience disappears
- each additional agent would require more one-off glue unless the architecture changes

## Goal

Make OpenClaw the orchestration source of truth for project work.

Claude, Codex, Gemini, and OpenClaw-native agents should become interchangeable execution adapters behind one neutral contract.

## Non-goals

- Do not rewrite the entire FleetCrown control surface in one pass
- Do not build a speculative adapter framework for hypothetical agents beyond known needs
- Do not delete the Claude loop until the replacement is proven
- Do not add more agent-specific state models

## First-principles constraints

1. **Software exists to serve humans**
   - the system should keep projects moving when one vendor path is unavailable

2. **State defines behavior**
   - orchestration state must have one source of truth
   - agent-specific sentinels cannot remain the top-level state model

3. **Change is constant**
   - agent adapters must be swappable without rewriting the control UI

4. **Machines are good at repetition; humans at judgment**
   - recurring task selection, verification, and handoff should be automated

5. **Complexity compounds**
   - keep the contract minimal
   - do not generalize beyond the capabilities actually needed

6. **Correctness beats speed**
   - preserve explicit session state, verification, and auditable task history

## Architectural principles

- **SSOT**: orchestration contract, state model, and prompt intents each live in one place
- **SoC**: separate orchestrator, adapter, and UI responsibilities
- **DRY**: stop duplicating Claude-only semantics across routes/components/scripts
- **YAGNI**: only model capabilities actually needed for current workflows
- **KISS**: small state machine, small adapter interface, incremental migration

## Desired architecture

### 1. Orchestrator layer

Owns:

- task intent selection
- lifecycle state
- handoff state
- retries / continue behavior
- completion summaries
- history and scheduling

Long-term home: **OpenClaw-backed orchestration**

### 2. Agent adapter layer

Owns:

- how to launch an agent session
- how to send a task to it
- how to detect status
- how to stop/close it
- what capabilities are supported

### 3. UI layer

Owns:

- controls
- status rendering
- filtering
- inspection
- manual interventions

FleetCrown should not own orchestration truth. It should render and steer it.

## Current system map

### Claude

Strengths:

- full prompt loop
- stop/wait lifecycle hooks
- session handoff files
- close-session flow
- mature local tab control

Weakness:

- architecture is Claude-specific

### Codex

Strengths:

- launchable and switchable
- viable coding backend

Weaknesses:

- no lifecycle integration
- no autonomous continue loop
- no close/session contract

### OpenClaw

Strengths:

- sessions
- background tasks
- cron / wake
- messaging / notifications
- tools / memory / subagents

Weakness:

- not yet the orchestrator of the local coding workflow

### Gemini

Strengths:

- present locally

Weakness:

- not meaningfully integrated yet

## Prompt intent model

The existing Claude prompts should be redefined as **orchestration intents**, not Claude text blobs.

Initial intent set:

- `next_best`
- `test_and_fix`
- `quality`
- `full_audit`
- `product`
- `ux_review`
- `deploy_check`
- `commit_push`
- `close_session`
- `continue`

Each intent should include:

- id
- name
- objective
- execution policy
- verification requirements
- handoff requirements
- adapter rendering template(s)

## Neutral orchestration state model

Canonical states:

- `idle`
- `running`
- `waiting`
- `done`
- `closing`
- `closed`
- `error`

Canonical lifecycle events:

- `task_started`
- `input_requested`
- `task_progressed`
- `task_completed`
- `continue_requested`
- `close_requested`
- `session_closed`
- `task_failed`

This model replaces agent-specific top-level semantics.

## Adapter capability model

Only model what current workflows need:

- launch session
- inject task
- detect running
- detect waiting
- detect done
- close session
- support autonomous continue
- support session handoff

Anything beyond that is deferred until needed.

## Proposed repository boundaries

### Keep in dotfiles

Only unavoidable local runtime/user configuration:

- shell environment
- local agent settings
- local hooks required by external CLIs
- temporary compatibility files while migrating

### Move to FleetCrown / OpenClaw-oriented code

- project registry abstraction
- orchestration state model
- prompt intent definitions
- adapter contract
- execution policy
- session state contract
- orchestration history model

## Migration phases

### Phase 1 — establish neutral contract

Deliverables:

- orchestration type definitions
- adapter capability model
- prompt intent type definitions
- lifecycle state definitions
- architecture plan document

Success criteria:

- no new top-level logic depends directly on Claude-specific names
- new work can reference neutral types first

### Phase 2 — lift prompt intents into SSOT

Deliverables:

- neutral prompt intent registry
- mapping from existing Claude prompts to neutral intents
- separation between intent definition and adapter rendering

Success criteria:

- prompt semantics are no longer trapped in Claude-only files

### Phase 3 — OpenClaw executor path

Deliverables:

- OpenClaw orchestration runner for project intents
- durable task/session state
- handoff summary contract (`done/next/tests/todos/health`)

Success criteria:

- at least one project intent can run through OpenClaw without Claude

### Phase 4 — Claude adapter compatibility

Deliverables:

- Claude adapter that implements the neutral contract
- compatibility bridge from Claude hooks to neutral lifecycle events

Success criteria:

- Claude still works, but as an adapter instead of architecture

### Phase 5 — Codex first-class support

Deliverables:

- Codex adapter
n- Codex lifecycle approximation or wrapper-driven status model
- session handoff support

Success criteria:

- Codex can run at least `next_best`, `test_and_fix`, and `close_session`

### Phase 6 — UI migration

Deliverables:

- Control UI reads neutral orchestration status
- UI surfaces adapter capabilities without assuming Claude semantics

Success criteria:

- UI no longer treats Claude state files as the canonical model

## Recommended implementation order

1. Define orchestration contract and state types
2. Define prompt intent SSOT
3. Add OpenClaw-native execution path for one or two key intents
4. Preserve Claude through adapter compatibility
5. Add Codex support
6. Decide if Gemini is worth real integration

## Risks

### Risk: duplicate sources of truth

Mitigation:
- keep neutral orchestration types as the SSOT
- mark Claude-specific state as compatibility-only

### Risk: over-engineering an adapter framework

Mitigation:
- support only known workflows
- keep capability flags minimal
- build adapters incrementally

### Risk: breaking existing Claude loop too early

Mitigation:
- treat Claude loop as production compatibility path until OpenClaw-native tasks are proven

## Definition of done for the migration

The migration is complete when:

- OpenClaw can run the key project-advancement intents without Claude
- FleetCrown renders neutral orchestration state
- Claude is an adapter, not the architecture
- Codex is at least partially first-class
- vendor-specific prompt/runtime details are below the adapter boundary

## Immediate next step

Implement Phase 1 scaffolding in `src/lib/orchestration/` so new work has a neutral foundation.
