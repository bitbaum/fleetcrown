# FleetCrown Sustainability Gates

**What this is:** three frozen rules that keep unit economics from inverting as
FleetCrown scales. Derived from the deep business-model analysis of 2026-07-19.
Each gate names a threshold and the machinery that must exist *before* the
threshold is crossed. These are anchors, not aspirations — do not cross a
threshold with the gate still open.

## Why FleetCrown is sustainable today

The model works because the expensive part — agent execution — is offloaded onto
the customer's own machine and their own agent keys (BYO-runner + BYO-keys,
enforced in `src/lib/execution-access.ts`). FleetCrown sells the **captain layer**
(the control plane) for CHF 15–90/mo while the customer pays 100% of the actual
Claude/OpenAI compute. At 10 / 100 / 1000 BYO users, FleetCrown's own marginal
cost is ~one shared Groq key + opt-in Resend email; fixed cost is one box +
Postgres. Break-even is ~2 paid subscriptions. This holds **only** while the
three gates below stay shut.

Current state (2026-07-21): 2 users, 0 paid, CHF 0 revenue-ever. The BTC pass
rail is live end-to-end (`/pricing` → OrangeCat products → HMAC entitlement
webhook → plan grant); revenue observability ships on `/system` (founder-only
`RevenueCard`). The first real sats purchase is the pending anchor.

## Gate 1 — Metering before hosted execution opens beyond the founder

**Threshold:** the moment any non-founder user can run agents on FleetCrown's own
box (i.e. `execution-access.ts` stops being a founder-only allowlist, or
`FLEETCROWN_EXECUTOR=sandbox` ships).

**Why:** the pricing ladder gates *project count*, which is uncorrelated with
compute cost. A flat CHF 40/mo Pro user running "build all my projects" autopilot
24/7 on FleetCrown-paid Claude compute burns multiples of their subscription. A
project-count paywall against unmetered autonomous runs inverts unit economics.

**Machinery that must exist first:** per-run cost accounting + a prepaid
credits/metered model (the deferred "Fleet Credits" — port OrangeCat's
`credit-metering.ts` cost×markup pattern rather than reinventing it), plus a
per-user run quota/entitlement gate. Until then, hosted execution stays
founder-only. **This gate is currently SHUT and must stay shut.**

## Gate 2 — Per-user Groq cap before ~50 active users

**Threshold:** roughly 50 daily-active users (whenever Groq free-tier rate limits
start throttling the shared key).

**Why:** one shared `GROQ_API_KEY` backs Loki fallback, dispatch, vision,
transcription, and digests for *all* tenants (`src/lib/groq.ts`), with no
per-user cap — only Groq's account-level rate limit. A noisy free user degrades
paid users' Loki/transcription, and the paid-Groq-plan cost scales with users but
is priced into nothing.

**Machinery that must exist first:** a per-user daily cap on Groq-backed
endpoints (OrangeCat already ships exactly this shape — the 10/day pattern in its
`cat-plans.ts`), ideally plan-tiered. Cheap to add; add it before it bites.

## Gate 3 — Per-seat Team billing before the first multi-seat Team sale

**Threshold:** the first Team-plan customer with more than ~2 seats.

**Why:** Team is a flat CHF 90/mo tier; Stripe checkout is `quantity: 1`
hardcoded (`src/app/api/stripe/checkout/route.ts`). A 10-person studio pays the
same CHF 90 as a 2-person one while consuming ~5× the Groq/email/support cost.
The whitepaper's "up to 10 people" is not enforced anywhere.

**Machinery that must exist first:** either enforce a seat cap or wire per-seat
pricing (seat count → `quantity`). Pick one before selling Team to a real studio.

## The honest holes this does not fix

- **Value capture is thin.** Every Pro/Team perk in the whitepaper ("faster
  inference, priority support") is unenforced marketing; the only code-enforced
  difference between tiers is the project limit. Real differentiators should
  either ship or leave the copy.
- **No trial mechanics, no conversion tracking.** The free tier is the permanent
  funnel entry; nothing measures paid conversion. `RevenueCard` is the first
  step — MRR is now visible; the funnel above it is not yet instrumented.
- **The two-product complement.** FleetCrown has recurring pricing but no usage
  metering; OrangeCat has usage metering (`credit-metering.ts`) but no recurring
  product. Each built the half the other lacks — Gate 1's Fleet Credits is
  OrangeCat's pattern ported inward; OrangeCat's missing Supporter checkout is
  FleetCrown's pass-product pattern ported outward. Solve them together.
