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

### Day 3 (Wed) — Make "best-effort" stop meaning "silently lossy" (Phase 0.4) ✅ DONE 2026-07-13
Surprise: **both** pieces were already built (FC commit `d9b784d` "feat(bridge): promote backfill cron + settings Connect OrangeCat") — the Day-2 map was wrong. So Day 3 became a verify-day, and both are now proven working in prod:
- ✅ **Backfill/reconcile cron** — `fc-cron@orangecat-promote-backfill.timer` active (daily 09:00 UTC, CRON_SECRET set, in install-hetzner-crons.sh). PROVEN: Day 2's publish dropped its `project_published` fire-and-forget promote (only the awaited devlog landed). Ran the backfill → `posted: 2, failed: 0` → the dropped **Project Published** anchor ("Life OS + AI agent fleet command · via FleetCrown") + a devlog entry appeared on the wall. "Best-effort" no longer means "silently lossy."
- ✅ **Settings → Connect OrangeCat** — `AccountSettings.ConnectedAccountsSection` (`showOrangeCatConnect` → `signIn("orangecat", {callbackUrl:"/settings#account"})` + disconnect guard). VERIFIED: Settings → Account shows **OrangeCat · Connected** alongside Google + GitHub; connected-accounts API + `[provider]` disconnect route both live.
- **Proof:** watched the reconcile cron heal a real dropped promote on orangecat.ch. The bridge is durable, not hopeful.
- **Known residual fragility (not blocking):** the publish-time `project_published` promote is `void`-fire-and-forget after the response, so it drops on every publish and relies on the daily cron to heal. Awaiting it (or a proper queue) would make it lossless at the source. Also flagged from Day 2: FC publishes the project as OC-**Draft** (OC `createProject` hardcodes DRAFT, ignoring FC's `status:"active"`), so the public project page's "Recent Activity" (reads `project_updates`, active/completed only) shows nothing — the wall lives on the profile Timeline. Both are real "build-in-public" coherence gaps for a later day.

### Day 4 (Thu) — Showcase the moat: cross-model verification ✅ DONE 2026-07-13
The DoD stop-gate already had a different-lineage judge (`gpt-oss-120b`) grading each worker's handoff — but the verdict was **invisible** (it only downgraded the outcome and buried the gap in `next`). Made it visible + proved it:
- ✅ **Surfaced the verdict in Activity** (FC commit `928df7b`): `OrchestrationTaskSummary.verification {judge, worker, met, gap}` written by the gate at close, rendered in the Events stream as "✓/✗ Cross-model check — <worker> did it, <judge> verified/flagged …". Deployed.
- ✅ **Proved the moat catches things** — live `gpt-oss-120b` (different lineage from the claude/llama workers) judged real handoffs: caught a glossy self-report ("provide evidence tests pass…"), passed a fully-evidenced one.
- ✅ **Found + fixed a real judge bug:** `summaryForJudge` didn't pass `commit` to the judge, so DoDs saying "committed" false-negatived a real commit. Fixed → verified the case flips to met.
- **Proof (witnessed live in prod Activity):** ran the real gate against a real Claude run's handoff → `gpt-oss-120b` returned **NOT met: "Missing evidence that the change has been deployed to production and is green"** — now shown on that run in Activity. *A different mind caught what the worker's self-report glossed. This is the thing no single-agent runtime can do.* (One historical run was annotated for the demo; going forward the gate fires automatically at close and also downgrades not-met success→partial.)

### Day 5 (Fri) — Narrate it: the bridge essay (Phase 4.1) ✅ DONE 2026-07-13
- ✅ Wrote + published **"Shipped Is Not Witnessed"** (`content/thoughts/shipped-is-not-witnessed.md`) — reportage of Days 2–4: the login that failed on an expired state cookie, the 403 that was an RLS/anon-write bug not a permissions problem, the fire-and-forget promote that dropped + the cron that healed it, the cross-model judge catching a Claude handoff with no deploy evidence. House voice, every detail verified (no fabricated timelines/metrics), reviewed + approved before publish.
- ✅ Live at fleetcrown.orangecat.ch/thoughts/shipped-is-not-witnessed (200, renders correctly). Build events already on the OC wall from Days 2–3 as the living proof the essay points to.
- **Proof:** a public essay that is reportage, not a promise — thesis: *shipping is a claim, witnessing is the fact.*

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
