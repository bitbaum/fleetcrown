# FleetCrown

FleetCrown is an execution operating system for builders who run many projects at
once. FleetCrown is a customer of sibling product OrangeCat (economic layer). Both have profiles as projects on orangecat.ch for Mao Nakamoto, with FleetCrown as "customer" via stakeholder graph, shared BTC wallet. The integration makes OrangeCat + FleetCrown the complete stack (production + economy).

The product thesis is simple: AI agents are becoming cheap execution capacity,
but serious users still need a trustworthy command center. FleetCrown provides the
state, queues, handoffs, guardrails, and business context around that capacity.

Production: https://fleetcrown.orangecat.ch

## What It Does

- **Agent operations**: launch, monitor, switch, and dispatch Claude, Codex,
  Gemini, Cursor, Grok, and OpenClaw across real project workspaces.
- **Hybrid control plane**: hosted Next.js app owns auth, database, product UI,
  and team state; a local daemon owns Zellij, shell, git, and agent CLIs.
- **Project execution memory**: per-project handoffs, queues, recent outcomes,
  lifecycle signals, git state, and saved context are visible in one place.
- **Builder life OS**: goals, people, habits, events, money, prompts, and
  thoughts live beside the work system rather than in disconnected apps.
- **Economy-aware**: Loki pulls open demand from sibling product OrangeCat and
  searches the economy by meaning (OrangeCat embeds the query server-side), so
  finding what already exists and building what's missing is one flow.
- **Operational trust**: runtime signals are persisted, versioned, and
  explained in the UI so users can tell the difference between active work,
  an open terminal, and historical handoff context.

## Product And Economic Model

FleetCrown is designed as a high-retention SaaS for power users and small teams. As a customer of OrangeCat, it demonstrates the "one is customer of the other" model (FleetCrown production consumes OrangeCat economic services). Both projects live on the OrangeCat platform with typed relations. See live: orangecat.ch projects for FleetCrown / OrangeCat (shared wallet bc1q3hh4yklcmwtpnqmxyksw36yedg7zyfy6tzzqwz).
The economic model is built around durable workflow ownership, not one-off AI
novelty.

| Layer | Value | Monetization path |
| --- | --- | --- |
| Individual builder | One FleetCrown for projects, agents, commitments, and execution memory | Pro subscription |
| Team / studio | Shared project state, team visibility, agent dispatch, audit trail | Per-seat team plan |
| Agent runtime | Local daemon connects private machines to the hosted control plane | Paid runtime seats / usage tiers |
| Execution intelligence | Prompt routing, queue reasoning, outcomes, continuation policies | Premium automation tier |
| Enterprise / investor diligence | Operating telemetry, governance, security, and project health | Managed deployment / annual contract |

See [docs/business-model.md](docs/business-model.md) for positioning,
pricing logic, expansion loops, and defensibility.

## Architecture At A Glance

```text
Hosted control plane (self-hosted Next.js on Hetzner, Caddy in front)
  Auth, database, UI, team state, command queue, runtime snapshots

Local runtime (user machine)
  Zellij tabs, agent CLIs, git, shell tools, daemon, hook bridge

Data layer (Postgres / Drizzle)
  User projects, runtime state, orchestration events, prompt queues,
  goals, people, habits, events, billing, memories
```

Key design rules:

- **SSOT first**: schema, navigation, agent registry, runtime snapshots, prompt
  queues, and design tokens each have one canonical owner.
- **Cloud/local separation**: browser workflows stay cloud-safe; shell and
  terminal work happens only through the authenticated local daemon.
- **Runtime truth beats assumptions**: Control reflects live daemon pushes,
  process detection, Zellij tabs, and timestamped handoff files.
- **Agent-agnostic direction**: Claude-era compatibility remains where needed,
  but adapters and registry definitions are the migration path.

## Stack

- **Next.js 16.2.6** App Router, React 19, TypeScript strict
- **PostgreSQL 17** with Drizzle ORM and schema-inferred types
- **NextAuth v5** with GitHub OAuth and local owner-key support for private
  installs
- **Tailwind CSS 4** with a tokenized dark-first design system
- **Zellij + local daemon** for terminal runtime control
- **Self-hosted on Hetzner** (`bitbaum` box, Caddy + systemd) — production deploys via `scripts/deploy-hetzner.sh` (build → rsync → restart); cron jobs run on the box
- **Husky + GitHub Actions** for type, lint, and audit checks

## Repository Map

```text
src/app/                 App routes and API endpoints
src/components/control/  Agent operations UI
src/components/*/        Domain surfaces: today, people, projects, goals, etc.
src/config/              Navigation, prompts, categories, product constants
src/db/schema/           Drizzle schema SSOT
src/db/queries/          Data access by domain
src/lib/                 Runtime, auth, orchestration, formatting, utilities
home/                    Local-first orchestration self-tests and runtime model
scripts/                 Daemon, install, smoke, migration, and verification tools
docs/                    Architecture, business model, cloud/local workflows
drizzle/                 Generated schema migrations
packages/agent/          Hosted installer CLI
content/                 Public essays and whitepaper content
```

## Quality Bar

Every change should preserve:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run check:design`
- `npm run test:control-presenter`
- `npm run test:home`
- `npm run test:db-url`
- `npm run test:orchestration-summary`
- `npm run build`
- `npm run smoke`

CI runs type/lint/design/self-test checks on pushes and pull requests. A
scheduled audit workflow fails on high or critical dependency vulnerabilities.
Production deploys to the Hetzner box run via `scripts/deploy-hetzner.sh`
(build → rsync → restart `fleetcrown-app`).

## Local Development

```bash
npm install
docker compose up db -d
cp .env.example .env.local
npm run migrate
npm run dev
```

Minimum local `.env.local`:

```bash
DATABASE_URL=postgresql://fleetcrown:changeme@localhost:5432/fleetcrown
AUTH_SECRET=replace-me
GITHUB_CLIENT_ID=replace-me
GITHUB_CLIENT_SECRET=replace-me
```

On a fresh database, visit `/setup` to create the first user.

### Local Agent Runtime

Agent dispatch from the hosted app needs a connected machine:

```bash
curl -fsSL https://fleetcrown.orangecat.ch/api/agent/install | node - init --base-url https://fleetcrown.orangecat.ch
```

The runtime requires Zellij and at least one supported CLI on `PATH`: `claude`,
`codex`, `gemini`, `agent` (Cursor), `grok`, or `openclaw`.

See [docs/development/cloud-local-workflows.md](docs/development/cloud-local-workflows.md)
for the full matrix of browser-only vs local-runtime workflows.

## Important Docs

- [Business model](docs/business-model.md)
- [Architecture principles](docs/architecture-first-principles.md)
- [Debt reduction roadmap](docs/debt-reduction-roadmap.md)
- [Cloud vs local workflows](docs/development/cloud-local-workflows.md)
- [Responsive design (mobile/tablet)](docs/development/responsive-design.md)
- [Agent CLI registry spec](docs/agent-cli-registry-spec.md)
- [Postgres portability](docs/infrastructure/postgres-portability.md)
- [Local orchestration runtime](home/README.md)

## Security And Operations

- Secrets stay out of Git; use `.env.example` as the contract.
- Production uses direct and pooled Postgres URLs separately.
- Local daemon access should use per-user `ck_*` agent tokens.
- Legacy shared daemon tokens require an explicit server-side opt-in flag.
- Private surfaces can be PIN-gated server-side.
- Dependency audit runs daily and high+ findings block the audit workflow.

See [SECURITY.md](SECURITY.md) for reporting and operational expectations.
> Hosted autonomous runs are powered by the FleetCrown Hermes runner.
