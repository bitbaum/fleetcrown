# GTM: Distribution Execution Plan — August 2026

**Status: operating plan.** This turns [master-plan-2026-07.md](master-plan-2026-07.md)
Phase 4 ("Distribution and proof") from a table of intentions into a runnable
routine. Positioning and ICP are already settled in
[positioning.md](positioning.md) and master plan §3.4 — this document does not
re-argue them, it schedules them.

What changed since the master plan: the distribution rail now exists. As of
2026-08-13 the Thoughts library (64 essays) has an RSS feed (`/rss.xml`),
share affordances on every essay, newsletter capture (capture-only,
`newsletter_subscribers` table), and the promised bridge essay
([the-two-halves-joined](/thoughts/the-two-halves-joined)) is published —
closing master-plan item 4.1.

---

## 1. The weekly cadence (master-plan 4.2, made concrete)

One loop per week, every week. Small, repeatable, and honest — the essays are
the moat; the cadence is what makes them a channel.

| Day | Action | Owner |
|-----|--------|-------|
| Any (build) | Ship real work; devlog events auto-promote to the OrangeCat wall (already automatic) | Fleet |
| +0 | Publish **one essay** to `content/thoughts/` (house voice per [thoughts-style-guide.md](thoughts-style-guide.md)) | Agent drafts, founder approves |
| +0 | Essay lands in RSS + sitemap automatically on deploy | Automatic |
| +1 | Cross-post: one X post + one LinkedIn variant from `content/social/queue.md` | Founder pastes (or approves send) |
| +7 | Note what moved (metrics §4) before writing the next essay | Agent |

Rules:
- **One essay per week, not more.** A backlog of drafts is fine; a burst of
  publishes reads as content marketing and dilutes the archive.
- **Never fabricate.** Every post links an essay; every essay cites what
  actually happened. Roadmap is labeled roadmap (master-plan §6 credibility
  rule).
- If a week has no essay-worthy material, skip the essay and say nothing.
  Silence is cheaper than filler.

## 2. Channel order (leverage-ranked, execute in sequence)

### 2.1 RSS + SEO — live now, zero marginal cost
- `/rss.xml` serves all essays; `/thoughts/rss.xml` redirects to it; the
  `<link rel="alternate">` tag is on the Thoughts surface. Sitemap already
  enumerates every essay.
- Nothing more to build here. This channel compounds on its own; measure
  subscribers via feed-reader user-agents in Caddy logs if ever needed.

### 2.2 X + LinkedIn — cross-post the strategy essays
The ~8 essays that carry the strategic story, in posting order:

1. [the-levelsio-pattern-productized-who-fleetcrown-is-for](/thoughts/the-levelsio-pattern-productized-who-fleetcrown-is-for) — the ICP essay; post first, it names the audience
2. [the-two-halves-joined](/thoughts/the-two-halves-joined) — the new bridge essay; the "we shipped what we promised" proof
3. [the-two-halves-of-the-individual-singularity](/thoughts/the-two-halves-of-the-individual-singularity) — the thesis
4. [the-captain-needs-a-ship](/thoughts/the-captain-needs-a-ship) — the honest gap essay
5. [shipped-is-not-witnessed](/thoughts/shipped-is-not-witnessed) — the verification story; strongest standalone
6. [the-techno-capital-machine-for-individuals](/thoughts/the-techno-capital-machine-for-individuals)
7. [money-is-energy](/thoughts/money-is-energy)
8. [two-products-or-one](/thoughts/two-products-or-one)

Ready-to-paste drafts live in [content/social/queue.md](../content/social/queue.md).
**Drafts only — the founder posts manually or explicitly approves each send.**
One per week alongside the cadence (§1); do not batch-blast the backlog.

### 2.3 HN / lobste.rs — the architecture deep-dives
These forums reward technical depth and punish marketing. Submit only the
engineering essays, as plain links, no campaign:

- [the-remote-runtime-bridge-full-technical-breakdown](/thoughts/the-remote-runtime-bridge-full-technical-breakdown)
- [killing-the-bash-daemon](/thoughts/killing-the-bash-daemon)
- [a-working-tree-is-a-lock](/thoughts/a-working-tree-is-a-lock)

Rules: one submission at a time, weeks apart; founder submits from his own
account; the author answers comments honestly (including "not built yet").
A dead submission costs nothing; a good one is the single highest-leverage
referral event available to a project like this.

### 2.4 OrangeCat cross-sell — the reciprocal loop
Already partially automatic: FC build events land on the OC wall. Remaining
moves are product work, tracked in the master plan (Phase 1.5 detect-and-
suggest, 1.6 wallet state on FC pages) — distribution's job here is only to
narrate each one as it ships (cadence §1).

## 3. The outbound GTM agent (FleetCrown runs its own outbound)

This is both FleetCrown's acquisition engine **and** a flagship FleetCrown
use-case: the same approval-queue + agent-fleet machinery the product sells,
pointed at the product's own growth. "FleetCrown runs its own outbound" is a
demo no slide can match — every step below is a FleetCrown feature being
dogfooded.

**Hard rule, stated once and absolute: no external message is ever sent
without the founder's explicit approval.** The agent researches, drafts, and
queues; a human releases. (Same posture as Ivy: autonomous internally,
supervised externally.)

The pipeline, as FleetCrown dispatches:

1. **Target market (SSOT).** The ICP from master-plan §3.4: AI-assisted solo
   builders and micro-studios already shipping with agents — people running
   Claude Code on a VPS today. Secondary: Swiss Bitcoin community via OC.
2. **Find accounts.** Agent task: identify individuals publicly matching the
   ICP (indie hackers posting agent workflows, VPS + agent setups on X/HN,
   attendees of relevant meetups). Output: a candidate list with source URLs.
3. **Research with evidence.** For each account, a dossier where every claim
   carries a source link **and retrieval date**. No sourced fact, no entry —
   the same grounding rule the Loki harness enforces (absence renders as
   "not recorded", never invented).
4. **Wait for a buying signal.** No cold-blast. A signal is a public artifact:
   a post complaining about juggling agent sessions, a "how do you monitor
   Claude Code remotely?" question, a launch that implies multi-project load.
   The agent watches; the queue stays empty until a signal exists.
5. **Draft outreach.** Every sentence in a draft must be one of four things:
   a **fact** (sourced, dated), an **inference** (labeled as such), an
   **offer** (what FleetCrown does for their specific situation), or a
   **question**. Nothing else — no flattery filler, no fake familiarity.
6. **Human approval.** The draft enters FleetCrown's approval queue
   (/approvals) — or Telegram when away — with the dossier attached. The
   founder approves, edits, or kills. Silence = not sent.
7. **Send.** Only after approval, from the founder's own accounts.
8. **Any reply pauses everything.** A response from a human immediately
   halts all queued outreach to that person and flags the thread for manual
   takeover. Agents never converse with prospects.
9. **Weekly learning loop.** Each week the agent writes a short memo: signals
   found, drafts approved/killed and why, replies, and one proposed change
   to the playbook. The playbook (this section) is updated by PR, so the
   process itself has a reviewed history.

Success for this section is double: pipeline (real conversations with real
ICP members) and proof (a public essay narrating the system itself, once it
has run honestly for a few weeks).

## 4. Metrics (extends master-plan §5, distribution slice)

| Metric | Now (2026-08-13) | Day 90 target | Source of truth |
|--------|------------------|---------------|-----------------|
| RSS feed | live | — (channel exists; subscriber counting is best-effort) | `/rss.xml` |
| Newsletter signups | 0 | first 25 | `newsletter_subscribers` table |
| Referral traffic to /thoughts | ~0 | measurable weekly stream | Caddy logs |
| GitHub stars (maonakamoto/fleetcrown) | baseline at start | growing week-over-week | GitHub |
| External users with connected runner | 0 | ≥ 10 | master-plan §5 |
| Paying customers (any tier) | 0 | ≥ 5 | master-plan §5 |

Do not report vanity aggregates; report deltas weekly in the cadence memo
(§1, day +7). A metric with no movement for three weeks triggers a channel
review, not more volume.

## 5. Out of bounds

- No paid ads before the domain decision (master-plan 4.4) — unresolved.
- No email **sending** until a real pipeline is designed; the newsletter is
  capture-only today and the signup copy promises nothing more.
- No growth-hack mechanics (follow-loops, engagement bait, thread-boy
  formatting). The voice of the essays is the brand; the distribution must
  not contradict it.
- No external message of any kind without founder approval (§3).
