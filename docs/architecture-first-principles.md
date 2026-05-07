# Cockpit Architecture Principles And Execution Plan

## Purpose

This document defines the engineering principles, first-principles framing,
and implementation plan for turning Cockpit from a useful Claude-shaped control
surface into a neutral orchestration system for multiple projects, users, and
agents.

This is the SSOT for:

- architectural principles
- domain boundaries
- state ownership rules
- migration priorities
- acceptance criteria for the next phases

It complements [openclaw-orchestration-plan.md](./openclaw-orchestration-plan.md)
by making the governing rules explicit.

For repo-specific cleanup priorities and sequencing, see
[debt-reduction-roadmap.md](./debt-reduction-roadmap.md).

## First-Principles Approach

We start from what must be true, not from the current implementation.

### 1. The system exists to reduce human cognitive load

The product is not prompt injection. The product is sustained forward motion
across many projects with low context-switching cost.

Implication:

- optimize for clarity, momentum, and trust
- minimize hidden behavior
- every automation should be inspectable

### 2. State determines behavior

A system can only act correctly if it knows what state it is in.

Implication:

- orchestration state must have one canonical owner
- raw runtime signals are inputs, not top-level truth
- behavior must derive from explicit state transitions

### 3. Interfaces outlive implementations

Vendors, CLIs, and local workflows will change.

Implication:

- agent-specific logic must sit behind adapters
- UI and orchestration policy must not depend on Claude-specific filenames,
  hooks, or prompt conventions
- local files may remain as transport during migration, but not as domain truth

### 4. Humans provide judgment; machines provide repetition

Machines should handle monitoring, continuation, handoff, and routine checks.
Humans should decide policy, priorities, and exceptions.

Implication:

- continue/retry/close behavior should be policy-driven
- dangerous actions should have explicit guardrails
- the system should know when to stop and ask

### 5. Complexity compounds unless boundaries are sharp

Every duplicated rule or leaky abstraction multiplies maintenance cost.

Implication:

- one meaning per concept
- one place per rule
- one contract per boundary

### 6. Trust requires auditability

Automation that cannot explain itself will eventually be disabled.

Implication:

- record why the system acted
- keep event history
- surface causes in the UI, not just outcomes

## Engineering Principles

### SSOT

Single Source Of Truth means each important concept has one canonical owner.

Rules:

- orchestration state has one canonical model
- prompt intents have one canonical registry
- adapter capabilities have one canonical definition
- project identity has one canonical ID independent of tab names
- policy defaults live in one config surface

Anti-patterns:

- one state name in `dotfiles`, another in Cockpit
- prompt semantics duplicated across UI, routes, and local scripts
- deriving domain truth from whichever file happens to exist

### DRY

Don't Repeat Yourself means do not duplicate semantics, not merely text.

Rules:

- lifecycle state names must not be redefined across scripts and TypeScript
- adapter capabilities must not be inferred differently in different modules
- continue logic must not be copied into multiple UI and backend paths

Anti-patterns:

- separate Claude-only state naming in scripts, routes, and components
- repeated prompt-key-to-meaning mappings
- duplicate window/TTL logic with divergent behavior

### SoC

Separation of Concerns means each layer owns one class of responsibility.

Rules:

- runtime adapters detect and emit signals
- orchestration core interprets signals and updates canonical state
- UI renders state and sends user intent
- `dotfiles` owns machine-local glue, not product semantics

Anti-patterns:

- UI deciding orchestration truth
- runtime hook files encoding business meaning
- project registry split between unrelated sources without explicit precedence

### KISS

Keep It Simple means prefer the smallest system that satisfies current needs.

Rules:

- small state machine
- narrow adapter interface
- explicit transitions
- incremental migration over speculative redesign

Anti-patterns:

- generic plugin systems before real requirements exist
- more states than users can reason about
- architecture that requires a rewrite to adopt

### YAGNI

You Aren't Gonna Need It means only model capabilities required by current
workflows.

Rules:

- add adapter capabilities only when at least one concrete workflow needs them
- do not model hypothetical agent features
- keep orchestration policy minimal until real exceptions appear

### Encapsulation

Implementation details should remain behind stable interfaces.

Rules:

- `/tmp` file layout is an adapter detail
- Zellij tab names are transport handles, not business keys
- Claude session file format is a compatibility artifact, not the orchestration model

### Idempotence

Repeated signals or retries must not corrupt state.

Rules:

- processing the same runtime event twice should be safe
- continue requests should be deduplicated
- close signals should not reopen sessions accidentally

### Observability

The system should explain what happened and why.

Rules:

- every state transition should be attributable to an event
- every auto-continue should record cause and policy
- adapter failures should be inspectable without opening local scripts

### Fail-Safe Defaults

When the system is uncertain, prefer pausing over unsafe automation.

Rules:

- risky intents require explicit confirmation or policy allowlist
- stale runtime state should degrade to waiting or unknown, not false certainty
- missing adapter signals should not imply success

## Domain Boundaries

### 1. Dotfiles

Owns:

- shell environment
- vendor CLI installation and local configuration
- OS hooks and notifications
- machine-specific paths and secrets
- temporary compatibility scripts during migration

Must not own:

- orchestration truth
- canonical lifecycle state names
- prompt intent meaning
- project registry truth
- continue/close policy

### 2. Runtime Adapter Layer

Owns:

- launching sessions
- injecting tasks
- detecting runtime signals
- converting vendor-specific signals into neutral events
- reporting supported capabilities

Must not own:

- cross-project prioritization
- orchestration policy
- UI rendering semantics

### 3. Orchestration Core

Owns:

- canonical task lifecycle state
- event ingestion and transition logic
- continue/retry/close policy
- task history
- handoff summaries
- scheduling and queueing

This layer is the brain of the system.

### 4. Cockpit UI

Owns:

- rendering state
- operator controls
- policy configuration
- explanations and audit surfaces
- filtering, sorting, and inspection

Must not own:

- hidden orchestration rules
- canonical state transition logic

## Canonical Model

### Canonical Project Identity

Each project needs:

- stable project ID
- display name
- canonical repo path
- optional runtime bindings such as tab name or session ID

Project identity must not depend on tab naming.

### Canonical Task States

Initial state machine:

- `idle`
- `running`
- `waiting`
- `done`
- `closing`
- `closed`
- `error`

These are product states, not vendor states.

### Canonical Events

Initial event set:

- `session_started`
- `task_started`
- `task_progressed`
- `input_requested`
- `task_completed`
- `continue_requested`
- `close_requested`
- `session_closed`
- `task_failed`
- `signal_stale`

### Canonical Policies

Each project should be able to define:

- auto-continue enabled or disabled
- default next intent
- intents requiring confirmation
- retry limit
- close behavior
- stale-state timeout behavior

## Operating Invariants

These must remain true through migration.

1. One event can produce many derived views, but only one canonical state change.
2. Runtime adapters may emit events, but may not define product semantics.
3. A UI banner is not state; it is a presentation of state.
4. Current state should be derivable from event history plus current runtime facts.
5. A missing runtime signal must not be treated as proof of success.
6. Auto-continue must always be attributable to an explicit policy and trigger.
7. Project-level and portfolio-level decisions must be separable.

## Current Gaps

The current system works, but violates the target architecture in several ways:

- `/tmp` sentinel names still encode Claude-era semantics
- local hooks act as hidden truth producers
- current prompt state is split across runtime files and DB fallbacks
- tab names still leak into project identity and session ownership
- UI banners partly encode orchestration behavior
- event history is incomplete relative to the decisions the system makes

## Plan

### Phase 1: Define neutral orchestration contract

Goal:

Create the canonical types and rules without breaking the current loop.

Deliverables:

- orchestration state enum
- orchestration event enum
- adapter capability contract
- project runtime binding model
- policy model for continue/close/retry

Acceptance criteria:

- no new feature adds Claude-specific top-level semantics
- all new orchestration code uses neutral names
- intent definitions are referenced from one registry

### Phase 2: Introduce event log and derived state

Goal:

Move from ad hoc file interpretation to explicit event-driven state.

Deliverables:

- append-only orchestration events table
- state reducer from events to current state
- ingestion path from existing runtime signals into neutral events
- event attribution fields: source, adapter, reason, timestamp

Acceptance criteria:

- every visible state transition has a corresponding stored event
- state can be rebuilt from event history plus live runtime facts
- auto-continue actions are recorded with policy cause

### Phase 3: Make adapters first-class

Goal:

Treat Claude, Codex, and OpenClaw as adapters behind one contract.

Deliverables:

- adapter interface with neutral lifecycle methods
- Claude compatibility adapter over current hooks
- Codex adapter with explicit lifecycle support
- OpenClaw adapter for native orchestration runs

Acceptance criteria:

- UI does not need vendor-specific branching for lifecycle meaning
- orchestration core can trigger the same intent through multiple adapters
- runtime-specific files are hidden behind adapter code

### Phase 4: Move orchestration policy into Cockpit

Goal:

Centralize continue, retry, and close logic.

Deliverables:

- policy evaluation service
- per-project policy settings
- safe defaults and confirmation rules
- explicit pause/hold state with reason

Acceptance criteria:

- countdown and auto-continue behavior are policy-driven
- policy decisions can be inspected after the fact
- `dotfiles` no longer decides product behavior

### Phase 5: Upgrade the control UI into an auditable operator surface

Goal:

Make the system explainable and trustworthy.

Deliverables:

- lifecycle timeline per project
- reason labels for auto-actions
- distinction between runtime state and orchestration state
- project and portfolio queues
- policy controls in the UI

Acceptance criteria:

- a user can answer "what happened, why, and what happens next?" from the UI
- ready/closed/running states are visible as lifecycle, not just banners
- manual vs automatic actions are clearly labeled

### Phase 6: Shrink dotfiles to a hardware abstraction layer

Goal:

Keep local machine glue, remove orchestration authority.

Deliverables:

- narrow compatibility hook surface
- local runtime installer/bootstrap docs
- migration of remaining semantic logic into Cockpit
- cleanup of obsolete Claude-only naming

Acceptance criteria:

- `dotfiles` is optional for orchestration semantics
- local scripts no longer define canonical state names
- a second machine/user setup can reproduce behavior from Cockpit-owned logic

## Immediate Next Actions

These are the next concrete implementation steps for this repo.

1. Create neutral orchestration state and event types in `src/lib/orchestration`.
2. Add an orchestration events table and query layer in `src/db/schema` and `src/db/queries`.
3. Introduce an event-ingestion module that converts current `/tmp` and session-file signals into neutral events.
4. Refactor control routes to read derived orchestration state instead of directly interpreting adapter-specific files as top-level truth.
5. Expose event history and policy cause in the `/control` API response.
6. Update the control UI to render lifecycle and action reasons.

## Decision Rule For Future Changes

Before adding any new runtime feature, ask:

1. What domain concept is being introduced?
2. Where is its SSOT?
3. Is this an adapter concern, orchestration concern, or UI concern?
4. Can the change be explained in neutral terms without referencing one vendor?
5. Can the resulting behavior be audited later?

If those questions cannot be answered cleanly, the change is not ready.
