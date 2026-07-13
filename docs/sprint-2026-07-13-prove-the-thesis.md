# One-Week Sprint — Prove the 10-Year Thesis

**Dates**: 2026-07-13 → 2026-07-20
**Author**: Claude Code + Mao
**Companion to**: `docs/master-plan-2026-07.md` (this is Phase 0 + a slice of Phase 1, sequenced day-by-day)

---

## The framing

You do not *reach* a 10-year vision in a week. What you can do in a week is
convert the vision's **load-bearing claims from hope into fact** — so every week
after compounds on proof instead of belief. That is the highest-leverage thing a
week can buy at this stage.

**The 10-year vision, one line:** FleetCrown is the governance layer for a world
where humans command fleets of minds — the captain's bridge (trust,
cross-model verification, governance of autonomy) with work plugged into an
economy the builder owns. As models commoditize, the bridge is the scarce,
defensible thing.

That vision rests on four bets. Three are unproven today:

| Bet | Status | The week's job |
|-----|--------|----------------|
| The captain layer is real and works | ~proven (dispatch loop battle-tested); loop now **complete in code** (PR #62) | Witness the FULL loop live, once |
| "The integration is the product" (FC↔OC) | **unproven** — 0 witnessed round-trips | Witness build-event → OC wall |
| Cross-model verification is the moat | exists as stop-gate, **never showcased** | Make it visibly catch something, once |
| A stranger can become a paying captain | **unproven** — onboarding unfinished, Stripe dark | Get ONE external signup path real |

The sprint rule (borrowed from the master plan): **one loop closed with a witness
beats ten features at 80%.** Each day ends with a screenshot-able proof.

---

## The 7 days — each day is one witnessed proof

### Day 1 (Mon) — Witness the full captain loop
The coherence loop is now closed in code (producer + executors + drain + life-OS
context, PR #62). Prove it as a human:
- Merge #62.
- In Loki chat: "remind me to X by Friday" and "email <me> the weekly recap" →
  confirm both land in the Today approval queue → approve → confirm the real
  effect (commitment row; email sent via Resend).
- Dispatch a real task to a project and confirm the injected prompt now contains
  the **operator's goals & deadlines** block (check `prompt_history.resolved_prompt`).
- **Proof:** a screenshot of chat → queue → executed, and a dispatch prompt that
  visibly carries the captain's objectives. *"The life-OS run by my fleet"* is now
  a fact, not a diagram.

### Day 2 (Tue) — Witness the OrangeCat bridge (master-plan Phase 0.1–0.3) ✅ DONE 2026-07-13
The code shipped weeks ago; nobody had watched it work in prod. Now witnessed:
- ✅ Signed in with OrangeCat (OIDC); `orangecat_actor_id` c9e52937-… + access/refresh tokens persisted. (Caught + noted: state-cookie expiry if the consent screen sits >15 min.)
- ✅ Published the FleetCrown project to OC → `orangecat_project_id` 856ef4ba-…; live at orangecat.ch/projects/856ef4ba-…
- ✅ Promoted a real devlog entry → rendered LIVE on mao's OrangeCat profile **Timeline** ("Project Updated · via FleetCrown").
- **Bug found + fixed to get here:** the loop "was never verified end-to-end" because OrangeCat's v1 entity-create inserted via a cookie-session Supabase client (anon under bearer auth) → RLS 42501. Fixed by applying OC's own service-role pattern (OC commit `d818ceb6`), deployed. See [[bug_oc_bridge_rls_entity_create]].
- **Proof:** a real FleetCrown build event, live on orangecat.ch, tagged "via FleetCrown." *"The integration is the product"* is now a **fact**, not a claim.

### Day 3 (Wed) — Make "best-effort" stop meaning "silently lossy" (Phase 0.4)
The one piece of Phase 0 that is code, not clicks — and it's the same anti-pattern
we just killed twice (the calendar no-op, the email fallback):
- Add the **promote backfill/reconcile cron**: re-emit unacknowledged promotes.
- Add the **Settings → "Connect OrangeCat"** path for already-signed-in users (today only the sign-in button exists).
- **Proof:** kill a promote mid-flight, watch the cron heal it. The bridge is now durable, not hopeful.

### Day 4 (Thu) — Showcase the moat: cross-model verification
This is the single most 10-year-differentiating thing in the codebase, and it's invisible.
- Take one real dispatch; have a **different model lineage** judge the result against the project's definition-of-done (the stop-gate exists — surface its verdict).
- Make the verdict visible in Activity: "Claude did it; Grok checked it; here's what it caught."
- **Proof:** one screenshot where a second mind catches something the first missed. *This is the thing no single-agent tool can do* — now demonstrable, not asserted.

### Day 5 (Fri) — Narrate it: the bridge essay (Phase 4.1)
54 essays is a distribution asset most funded startups lack. The bridge essay was
forward-referenced months ago; this is the week it's true.
- Write + publish the essay narrating the loop you witnessed Days 2–4 (build → publish → verify → wall).
- Cross-post the FleetCrown build events to the OC wall as living proof.
- **Proof:** a public essay that is *reportage, not a promise* — with links to the real artifacts.

### Day 6 (Sat) — One stranger's on-ramp (Phase 1.1, sliced)
The revenue thesis needs the signup → runner → first-dispatch path to work for
someone who isn't you.
- Walk the onboarding as a fresh user (new account, no founder allowlist): sign up → create a project → install Fleet Runner → first dispatch → watch it live.
- Fix the top 1–2 friction points that block it (measure signup→first-dispatch time).
- Flip `isStripeReady()` live if the price IDs are a 10-minute config away (the `/pricing` page already shipped).
- **Proof:** a screen recording of a clean-room signup reaching a first successful dispatch.

### Day 7 (Sun) — Harden what a paying user would hit + retro
The audit's HIGH/MEDIUM items are "future 2am incidents with a paying user attached":
- Ship the audit quick-wins already staged: Stripe webhook + `/api/github/repos` guards, the ~7 raw-`session.user.id` → `resolveSessionUserId()` migration, `SESSION_STATUS` constant (safety gate), beacon `[tab]` traversal reject.
- Retro: which of the four bets are now **fact**? What's the next week's single loop?
- **Proof:** `docs/AUDIT_REPORT.md` action items 1–5 checked off; a one-paragraph "what's proven now" note.

---

## What this week is NOT

Explicitly deferred (correctly — per the master plan's split of Horizon E):
- **Hosted execution / `SandboxExecutor`** (multi-tenant cloud compute) — 4–6 weeks, gated on real isolation. Not this week.
- **Full multi-tenant onboarding at scale** — this week proves ONE stranger's path, not a funnel.
- **The economy/governance layers (OrangeCat credits, Solon)** — the 10-year end state, not the 1-week step.

## What the week buys

After 7 days, three of the four load-bearing bets move from **claim → witnessed
fact**: the captain loop works, the FC↔OC integration is real and durable, and
the cross-model moat is demonstrable — narrated publicly, with one stranger's
on-ramp proven and the sharpest security debt closed. From there, Phase 1
(revenue) compounds on proof instead of hope. That is as close to the 10-year
vision as a single week can get you: not the cathedral, but the load-bearing
stones, laid and load-tested.
