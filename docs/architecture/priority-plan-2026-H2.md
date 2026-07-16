# FleetCrown priority plan — H2 2026

---
created_date: 2026-06-30
last_modified_date: 2026-07-16
last_modified_summary: Horizon C1-C4 completed: Loki resolves project context from natural language, suggests grounded next commands, sends suggestion chips immediately, shares project context with Control and Terminal, and Control has an honest first-paint skeleton.
---

**North star:** Borrow the workers, own the bridge — one captain's interface over swappable runtimes, with verification and fleet governance you can trust.

**Honest status (2026-06):** pre-1.0, one paying operator (dogfood), schema-ready multi-user SaaS, single-tenant cloud execution (box-runner + optional desktop).

**SSOT for autopilot:** re-run `FLEETCROWN_SEED_ROADMAP=1 DATABASE_URL=… npx tsx scripts/seed-fleetcrown-roadmap.ts` after milestone edits so `getProjectContext` goals match this plan.

## Layer stack (dependency order)

```
L1 Execution  → L2 Trust  → L3 One command  → L4 Growth
```

Upper layers fail if lower layers lie. Do not start multi-tenant or OrangeCat bridge until Layer 1 closes for daily dogfood.

## Horizon A — Close the loop (weeks 1–4)

Goal: Talk to Loki → work runs on cloud → watch it without mental model hacks.

| ID | Initiative | Acceptance | Status |
|----|------------|------------|--------|
| A1 | Terminal Cloud = dispatched agent (peek/box-runner) | `/terminal?source=server&tab=fleetcrown` shows box-runner Claude session; **interactive typing** (rawkey) | [x] |
| A2 | Gate `/api/workspaces` on prod web | Cloud tab uses peek only; web app does not spawn PTYs when `!isRuntimeAvailable()` | [x] |
| A3 | Box-runner hardening | Claude auth on box; clone-on-demand for git-backed projects; deploy + restart verified | [x] |
| A4 | Builder presence clarity | Control/Loki show Cloud builder vs This computer vs queued offline | [x] |
| A5 | Loki reliability (prefetch + error/retry) | Projects/conversations on first paint; `?project=fleetcrown` auto-select | [x] |
| A6 | Doc refresh SSOT | HANDOFF, hosted-runner status, cloud-local workflows aligned to box-runner + Loki | [x] |

**Sprint 1 (recommended):** A1 + A2 together, then A6, then B1.

## Horizon B — Trust the fleet (weeks 4–8)

| ID | Initiative | Acceptance | Status |
|----|------------|------------|--------|
| B1 | Orchestration SSOT (debt roadmap P1–2) | `orchestration_events` → reducer → `/api/control` reads derived lifecycle state; legacy DB fallback retained during migration | [x] partial |
| B2 | Context on every dispatch path | Session handoff + RAG + profile on all inject paths | [x] |
| B3 | Run outcomes in Activity | Finished runs visible in timeline (not just "dispatched") | [x] |
| B4 | Truthful chips | Stale-running, no-commit, block-reason surfaced on cards | [x] |
| B5 | Runner stall recovery | Auto-recover or alert within one poll cycle | [x] alert |
| B6 | Finish PTY cutover | Dispatch path off zellij name-puppeting; box-runner milestones 3–4 | [x] partial |

## Horizon C — One command at scale (weeks 8–12)

| ID | Initiative | Status |
|----|------------|--------|
| C1 | Loki Phase 4 — smart project pre-select from NL | [x] |
| C2 | Suggested next commands from fleet state | [x] |
| C3 | Control SSR/skeleton fleet header (no empty first paint) | [x] skeleton |
| C4 | Chip → send (Move forward one tap) | [x] |
| C5 | Hosted runner Phase 1 honest — sandboxed Hermes, docs updated | [ ] Sandbox substrate exists; hosted product path still gated |

## Horizon D — First external user (weeks 12–16)

| ID | Initiative | Status |
|----|------------|--------|
| D1 | Per-user agent tokens + desktop path documented | [ ] |
| D2 | Onboarding → first dispatch → watch path | [ ] |
| D3 | Deploy: ledger migrations + rollback on failed health | [ ] |
| D4 | Apt repo / desktop auto-update polish | [ ] |
| D5 | Do not open box-runner to all tenants (needs SandboxExecutor P3) | [x] first safety gate |

## Horizon E — Multi-tenant + OrangeCat (6+ months)

Only after D succeeds. See `docs/architecture/agent-execution-platform.md`, `docs/architecture/cross-product-identity-bridge.md`.

**Current gate:** Horizon C1-C4 are complete as of 2026-07-16. Production dogfood also moved FleetCrown handoffs to `~/.fleetcrown/sessions`, outside Claude's protected configuration tree; startup migrates legacy Markdown state before watching it. C5 remains gated on hosted-runner isolation and product controls. B6 still has legacy zellij attach fallback; D/E require external-user onboarding, per-user agent credentials, rollback automation, and sandboxed multi-tenant execution.

## Defer (anti-patterns)

OrangeCat identity bridge, multi-tenant SaaS launch, `packages/fleetcrown-core` extraction, Life OS surface expansion, CRDT/native mobile, OpenClaw as orchestration SSOT, i18n CI / de-CH SLAs.

## Dogfood success metrics

| Metric | Pass |
|--------|------|
| Loki → dispatch | `?project=fleetcrown` + "move forward" → "With builder — starting shortly" in <5s |
| Watch | Terminal Cloud shows Claude output for fleetcrown within 10s; **typing echoes in the PTY** |
| Laptop off | Same flow with lid closed (box-runner only) |
| Control truth | fleetcrown card state matches agent reality |
| Activity | Last run shows outcome + commit, not just dispatch row |
| Overnight | Autopilot completes ≥1 meaningful milestone without manual nudge |

## Doc contradictions resolved here

| Stale doc | Reality |
|-----------|---------|
| HANDOFF: desktop runner is keystone | Box-runner is default cloud builder |
| Hosted runner Phase 0 "in progress" | Phase 0 + Hermes dispatch largely implemented |
| Loki: inject into Zellij | Owned PTY via box-runner |
| Multi-user SaaS ready | Execution is founder-single-tenant |
| Two products integrated | OrangeCat bridge not built |

## Related docs

- `docs/architecture/box-owned-pty-executor.md` — box-runner architecture
- `docs/architecture/multitenancy-execution-plan.md` — tenant execution boundary + hosted sandbox plan
- `docs/debt-reduction-roadmap.md` — orchestration SSOT (B1)
- `docs/loki-command-surface.md` — Loki phases
- `docs/development/cloud-local-workflows.md` — builder vs control plane
- `scripts/seed-fleetcrown-roadmap.ts` — autopilot goal seeds
