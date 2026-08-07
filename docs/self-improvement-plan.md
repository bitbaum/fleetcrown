# Self-Improvement Plan — Closing FleetCrown's Learning Loop

**Date**: 2026-08-07
**Status**: Plan — Phase 0 not started
**Owner**: orchestration
**Related**: [architecture-first-principles.md](architecture-first-principles.md), [sustainability-gates.md](sustainability-gates.md), Thoughts essay "The Fleet Learns From What It Reads, Not What It Does"

---

## 1. The finding this plan answers

FleetCrown improves from what it **reads**, not from what it **does**.

`src/lib/frontier/` is the only self-improvement loop in the product, and
`src/lib/frontier/sources.ts` shows what feeds it: arXiv RSS, Lobsters, Hacker
News. It reads the literature, drafts proposals for how FleetCrown should
evolve, runs them past a diverse judge panel, and surfaces survivors to a human.
That loop is well-built and stays.

But FleetCrown's own operational data — the one dataset nobody else has — feeds
nothing. Every consumer of `prompt_history` (`today.ts`, `activity.ts`,
`digests.ts`, `queries/users.ts`, `project-merge.ts`, `api/me/export`) is a
**display** surface. There are zero optimizers.

The 2026 literature counts 166 papers on scaffolding improvement against 73 on
foundation-model improvement. Scaffolding improvement means *learning from your
own trajectories*. We are the inverse of the field.

### What we already have (do not rebuild)

| Asset | Where | Why it matters |
| --- | --- | --- |
| Cross-lineage judge | `src/lib/orchestration/dod-gate.ts` | gpt-oss-120b grades claude/llama workers. Explicitly refuses the agent's self-assessment. Fails OPEN. |
| Natural-language failure critique | `DoDVerdict.gap` | One sentence naming what is still missing. This is the *textual feedback* signal, not a scalar. |
| Rendered prompt body | `prompt_history.resolvedPrompt` | The exact text sent to the agent, per dispatch. |
| Graded outcome + cost | `orchestration_runs.outcome`, `summary`, `tokensIn/Out`, `costUsd` | success / partial / error / hang / user_abort / timeout. |
| Structured escalation | `src/lib/orchestration/escalation-ladder.ts` | retry → patch → replan → human, SSOT'd to the failure brake. |
| Human gate pattern | `src/lib/frontier/run.ts` | Auto-propose only; a human accepts or dismisses. Proven, reusable. |

We have the *hard* half of a self-improvement loop: a trustworthy verifier,
graded outcomes, cost accounting, and human gates. Most teams build the optimizer
first and discover months later that their reward signal was garbage. We built
the signal first.

What is missing is the cheap half: a routine that reads the corpus and edits the
prompts.

### What is actually blocking it

`prompt_history` has **no `runId`**. The prompt→outcome join is only possible by
`(userId, projectKey, adapter, intent, time-proximity)`, which is lossy under
concurrency — and concurrency is our normal operating state.

It is **not** a pure schema change. At `src/app/api/orchestration/run/route.ts:270`
the prompt is logged *before* the `orchestration_runs` row is created, and the
insert is fire-and-forget (`.catch(...)`, not awaited), so its id is not
available to the run. There are three write sites:

- `src/lib/inject-core.ts:452`
- `src/app/api/orchestration/run/route.ts:270` (not awaited)
- `src/app/api/activity/capture/route.ts:80` (awaited)

Phase 0 is therefore "one column **plus** make the dispatch write an ordered,
linked pair." Small, but not zero. Sizing it honestly is the difference between
a plan that works and a plan that stalls in week one.

---

## 2. Design constraints taken from the literature

These are not preferences. Each one is a documented failure mode that has already
bitten published systems, and each maps to a concrete rule below.

**C1 — The verification horizon.** Verification difficulty grows faster than
generation difficulty. A reward can be *scalable*, *faithful*, or *robust* —
pick two. No fixed reward survives continued capability growth; reward hacking
"cannot be eliminated by static hardening, only suppressed by dynamic audit."
→ *Rule: repair the verifier before applying optimization pressure to it, and
re-audit the verifier every cycle.*

**C2 — Misevolution.** Self-evolving agents degrade with no attacker present:
safety-alignment decay, deployment-time reward hacking, insecure tool reuse.
Root cause: over-relying on past successes without critical reflection. The
cheapest known mitigation is framing retrieved memory as *references*, not
*rules*.
→ *Rule: never auto-apply a scaffold edit; every learned artifact carries a
"reference, not rule" framing.*

**C3 — Context collapse and brevity bias.** Prompt optimizers favour short
compact instructions, so hard-won domain specifics get compressed out, and
iterative full rewrites erode detail over time.
→ *Rule: learned context is stored as itemized bullets with incremental deltas.
Never rewrite a prompt body wholesale.*

**C4 — Extrinsic metacognition is a ceiling.** Fixed, human-designed improvement
policies cannot generalize past what their designer anticipated. Our
`escalation-ladder.ts` is exactly this: four hardcoded strings.
→ *Rule: the improvement policy itself must eventually become a learned artifact,
not a constant — but only after the loop is trustworthy.*

**C5 — Prime Agent's Factorio result.** A self-refining harness that judges its
own trajectory and auto-applies its edits learned to reward-hack a game. Our
cross-lineage judge plus human gate is the structural answer.
→ *Rule: the judge is never the same lineage as the worker, and never the same
agent that proposes the edit.*

---

## 3. Two corpus caveats that gate everything

Both are already-known FleetCrown findings, and both invalidate naive use of the
run history as training data.

1. **The evidence pipe was severed.** For 56 runs, `tsc`/`lint`/`commit` were
   declared in the worker contract and in `dod-gate.ts`'s evidence list, but no
   layer in between carried them. Runs from before that fix record silence where
   evidence should be, and silence reads as "skipped." An optimizer trained on
   that corpus learns that saying nothing is safe.
   → **Filter the corpus on evidence-present. Do not backfill by inference.**

2. **The bar was vague.** 10 of 19 `definition_of_done` values were
   product-vague, which is why 26 runs closed partial against 3 successes — the
   bar was the problem, not the agents. A fitness function built on vague labels
   optimizes toward a vague bar with total confidence.
   → **Repair the rubrics before Phase 2. This is C1 in practice.**

---

## 4. Phases

Each phase is independently valuable and independently abandonable. Every phase
has an acceptance criterion (ship it) and a kill criterion (stop, the premise
was wrong). No phase depends on a later phase being built.

### Phase 0 — Make the corpus joinable

**Do:**
- Add nullable `run_id` to `prompt_history` with an FK to `orchestration_runs`,
  plus an index. Nullable because lifecycle intents (`hard_stop`,
  `close_session`) legitimately produce no run.
- Reorder `src/app/api/orchestration/run/route.ts` so the run row is created
  first, then the prompt is logged against it. Await the insert.
- Do the same at `src/lib/inject-core.ts:452`. Leave
  `api/activity/capture/route.ts` unlinked if no run exists for it.
- Generate the migration with `npm run db:generate` (do not hand-write SQL —
  the deploy schema-drift guard compares against Drizzle).

**Acceptance:** every new dispatch that produces a run has a `prompt_history`
row pointing at it. Verified by a query returning 0 orphaned same-minute rows
across a day of real traffic.

**Kill:** none — this is pure instrumentation and is worth doing even if every
later phase is abandoned.

**Size:** small. 4 files, 1 migration.

### Phase 1 — Measure before optimizing

**Do:**
- One read-only report: per `intent`, over evidence-present runs, show
  success / partial / error rate, median cost, and the ten most frequent
  `DoDVerdict.gap` sentences.
- Ship it as an internal page, not a public surface.

**Acceptance:** the report names at least three intents whose failure modes are
*legible* — a human can read the top gaps and say "yes, the prompt is why."

**Kill:** if the gaps are dominated by infrastructure noise (rate limits,
network, auth) rather than instruction quality, then prompts are not the
bottleneck. **Stop here and fix infrastructure instead.** This is the most
important kill criterion in the plan: it is the check against optimizing a thing
that was never the problem.

**Size:** small. One query module, one page.

### Phase 2 — Repair the verifier

**Do:**
- Rewrite the product-vague `definition_of_done` values into checkable bars,
  using the evidence fields `dod-gate.ts` can actually see.
- Add a "rubric quality" check: a DoD that never produces a `met: true` across N
  runs is flagged as suspect rather than treated as a high bar.

**Acceptance:** the partial/success ratio moves *without any prompt change* —
which proves the bar was miscalibrated, exactly as the earlier gate audit found.

**Kill:** if repairing rubrics does not move the ratio, the workers really are
failing and Phase 3 is aimed at the wrong layer.

**Size:** medium, mostly content not code.

### Phase 3 — Offline prompt optimization (GEPA-shaped)

**Do:**
- Batch job, offline, one intent at a time. Never in the dispatch path.
- Candidate generation reads: `resolvedPrompt`, the graded `outcome`, and the
  judge's `gap` sentence. The `gap` is the reflection signal — the whole finding
  of the GEPA line of work is that natural-language feedback beats scalar reward
  and needs far fewer rollouts.
- Fitness = DoD verdict + evidence-present + cost, evaluated by the existing
  cross-lineage judge (C5).
- Output is a **proposed diff to `src/config/prompt-library.ts`**, surfaced for
  human accept/dismiss through the same pattern `frontier/run.ts` already uses.
  Never auto-applied (C2).
- Store per-intent learnings as itemized bullets with incremental deltas, not as
  a rewritten prompt body (C3).

**Acceptance:** at least one accepted prompt diff measurably improves its
intent's success rate on subsequent runs, held out against the pre-change
baseline from Phase 1.

**Kill:** if three consecutive optimization cycles produce no human-accepted
diff, the corpus is too small or too noisy. Park it and revisit at 10× volume.

**Size:** large. This is the real build.

**Note on the scaffold being compile-time:** `~/.config/agent-prompts.json` is a
*build artifact* generated from `src/config/prompt-library.ts` by
`scripts/generate-agent-prompts.ts`. That is correct and stays. Optimization
proposes a source edit that goes through review and rebuild — it does not write
the artifact. Keeping the improvement substrate in version control is what makes
every edit auditable and revertible.

### Phase 4 — Per-project experience memory

**Do:**
- A `project_lessons` table: per project, per intent, distilled bullets from
  prior runs, with provenance (which run taught this) and a decay/review date.
- Injected into dispatch context as **references, not rules** (C2 — the single
  cheapest known misevolution mitigation).
- A lesson that never correlates with a better outcome expires automatically.

**Acceptance:** projects with lessons show a lower first-run failure rate than
their own pre-lesson baseline.

**Kill:** if lessons measurably increase repeat-failure rates, we have induced
the self-reinforcing error loop the misevolution work describes. Revert
immediately — this is a known and expected failure mode, not a surprise.

**Size:** medium.

**Why this phase is high-confidence:** memory is the largest category in the
survey (61 papers) and the most production-proven of the four scaffolding
families. If only one phase after 0–2 gets built, build this one.

### Phase 5 — Learn the improvement policy itself (do not start before Phase 3 ships)

`escalation-ladder.ts` maps failure-streak → instruction via four hardcoded
strings. That is a fixed human-designed policy — C4's ceiling, in our own
codebase. The search space is tiny (four strings) and the fitness is unusually
clean: *does the streak break?*

Explicitly deferred. It is the highest-leverage remaining item and the easiest to
do prematurely.

---

## 5. What we are deliberately not doing

- **No weight updates.** FleetCrown does not own weights; vendor CLIs do. The
  hybrid harness+weights work shows the two contribute differently — harness
  updates improve the engineering around the model, weight updates add
  task-specific intuition the scaffold never finds. We can only have the first,
  and it is ~70% of the published field. That is a fine place to live.
- **No self-modifying agent code.** The full-scaffolding-rewrite family (18
  papers) is the least mature and the highest-variance. We are not rewriting our
  own codebase autonomously.
- **No auto-applied scaffold edits, at any phase.** This is the one rule with no
  planned expiry.
- **No new graph, no second SSOT.** Learnings attach to existing entities.

## 6. Where FleetCrown could actually lead

A self-refining harness sees one session's trajectory. FleetCrown sees every run,
every project, every agent, with graded outcomes, cost, and a cross-lineage
verdict. **Cross-project prompt optimization over a real multi-tenant rollout
corpus is something no single-session harness vendor can do**, because they never
see the second project.

That is the defensible position, and it is roughly Phase 0 + Phase 3 away.

## 7. Honest risks

1. **Volume.** Prompt optimization is data-hungry. Our corpus may simply be too
   small until fleet usage grows. Phase 1's kill criterion is designed to catch
   this before we spend the Phase 3 budget.
2. **The bar moves under us.** Repairing rubrics in Phase 2 changes the meaning
   of `outcome`, so the Phase 1 baseline is not comparable across that boundary.
   Re-baseline after Phase 2; do not compare across it.
3. **We optimize toward the judge, not the user.** The judge is a proxy. C1 says
   the proxy degrades under pressure. Mitigation: track the judge's own
   agreement with human accept/dismiss decisions as a first-class metric, and
   treat divergence as a signal to repair the judge — not the agents.
4. **This plan competes for time with distribution work**, which is the
   committed NEXT roadmap phase and has clearer user demand. Phases 0–1 are
   small enough to run alongside. Phase 3 is not; it needs its own slot.
