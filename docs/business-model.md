# FleetCrown Business Model

## Thesis

AI agents create execution supply. The scarce resource shifts to judgment,
context, prioritization, and trust. FleetCrown owns that layer: the durable
operating system around agents, projects, and the human decisions that guide
them.

The product is not a chat UI. It is a command center for people who already
have too many projects and too much execution surface area.

## Customer Segments

| Segment | Pain | Why FleetCrown wins |
| --- | --- | --- |
| Founder / solo builder | Many projects, fragmented tools, agent work hard to supervise | One control plane for projects, agents, commitments, and handoffs |
| Small product studio | Multiple client/internal projects with scattered state | Shared project memory, prompt queues, runtime visibility, team context |
| Engineering-first operator | Wants automation without opaque autonomy | Inspectable state, local runtime, explicit lifecycle and dispatch records |
| Investor / advisor | Needs a fast read on operational quality and execution velocity | Project health, history, docs, and product telemetry in one system |

## Pricing Logic

Pricing should follow value captured, not token volume alone.

1. **Personal Pro**
   - For one builder using FleetCrown as daily operating layer.
   - Includes projects, goals, people, habits, events, money, prompts, and one
     connected runtime.

2. **Team**
   - Per-seat plan for studios and small teams.
   - Adds shared projects, team visibility, project ownership, runtime health,
     and collaboration workflows.

3. **Automation**
   - Premium add-on for higher autonomy: auto-continue policies, prompt routing,
     recurring jobs, richer outcome analysis, and governance.

4. **Enterprise / Managed**
   - Annual contract for teams that need private deployment, SSO, audit
     retention, custom data residency, or hands-on workflow integration.

## Expansion Loops

- **Project count expansion**: more tracked projects increase switching cost
  outside FleetCrown and make the unified control plane more valuable.
- **Runtime expansion**: each additional machine or agent CLI increases the need
  for trustworthy visibility and queue ownership.
- **Team expansion**: project state becomes more valuable when shared.
- **Automation expansion**: as trust accumulates, users move from manual dispatch
  to policy-driven continuation and recurring work.
- **Knowledge expansion**: people, goals, events, thoughts, and project history
  create an operating memory competitors cannot import easily.

## Defensibility

- **Workflow lock-in through state**: handoffs, queues, outcomes, goals, and
  project memory compound over time.
- **Hybrid architecture**: cloud UX plus local runtime gives strong privacy and
  terminal power without forcing code onto a third-party sandbox.
- **Agent neutrality**: FleetCrown is positioned above individual model vendors and
  CLIs.
- **Operating cadence**: daily use across Today, Control, Projects, People, and
  Goals creates habit-level retention.
- **Technical trust**: explicit state ownership and auditability make the system
  credible for serious builders.

## Metrics That Matter

- Weekly active projects per user
- Agent dispatches per active project
- Successful handoffs / continuations per week
- Time from idea capture to project action
- Team projects with multiple contributors
- Retained runtime connections
- Paid conversion by project count and runtime count

## Current Product Proof Points

- Multi-user auth and project registry
- Production hosted control plane
- Local daemon connected to Zellij and agent CLIs
- Multi-agent registry: Claude, Codex, Gemini, Cursor, Grok, OpenClaw
- Runtime snapshots and per-project operational state
- Life OS domains: Today, Goals, People, Habits, Events, Money, Prompts
- Public thoughts and whitepaper surfaces for narrative and market education
- CI, audit, smoke, and Vercel deployment checks
