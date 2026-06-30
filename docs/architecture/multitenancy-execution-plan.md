---
created_date: 2026-06-30
last_modified_date: 2026-06-30
last_modified_summary: First multitenancy execution boundary: shared cloud builder stays private; external tenants route to their own Fleet Runner until sandboxed hosted builders ship.
---

# Multitenancy Execution Plan

FleetCrown is already mostly tenant-shaped at the control-plane layer: users own projects, agent tokens are per-user, pending commands carry `user_id`, and runners claim commands with their own `ck_` token. The scaling risk is execution, not CRUD.

## Tenant Boundary

The current always-on box-runner is a founder cloud builder. It owns real PTYs, filesystem state, CLI auth, project checkouts, and agent credentials. That is not a safe tenant boundary for arbitrary users.

Therefore:

- Founder / allowlisted accounts may use the shared `cloud` builder channel.
- Other accounts must use their own Fleet Runner (`local` builder channel).
- If no builder is connected for a non-cloud-enabled account, dispatch fails clearly with `builder-required` instead of queueing forever.
- Explicit Cloud terminal/input requests for non-cloud-enabled accounts return `cloud-builder-private`.

The SSOT is `src/lib/execution-access.ts`.

## Why This Comes First

Without this boundary, a new public user can experience one of two failures:

- Work queues into infrastructure they do not own and may never be able to observe.
- A shared runner becomes a cross-tenant filesystem / credential / terminal risk.

The current slice chooses product honesty over fake availability.

## Path To Scalable Hosted Execution

1. Keep control-plane data user/org scoped.
2. Keep external beta users on Fleet Runner desktop by default.
3. Build a hosted sandbox executor before enabling Cloud broadly:
   - one tenant/run per sandbox
   - fresh clone from `git_url`
   - no shared home directory
   - per-tenant secret vault
   - CPU/memory/time quotas
   - durable run logs and artifacts
   - explicit egress policy
4. Add an entitlement flag for hosted execution when billing/quotas exist.
5. Enable Cloud per tenant only after sandbox executor passes registration → onboarding → dispatch → terminal smoke.

## Product Contract

Projects remains the strategic registry. Loki and Control compile intent into the same queue. Terminal verifies and lets the user type into the actual PTY. Multitenancy requires those surfaces to agree on executor availability:

- If Cloud is unavailable, say so.
- If This computer is connected, route work there.
- If no builder is connected, do not claim work has started.
