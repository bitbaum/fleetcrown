// One-call orchestration for the daily frontier digest: ingest → rank → store.
// Shared by the cron route and the manual seed script so the pipeline has a
// single entry point (SSOT).

import { ingestFrontier } from "./ingest";
import { generateFrontierDigest } from "./digest";
import { generateProposals, verifyProposals, type GenerationOutcome } from "./propose";
import {
  upsertFrontierDigest,
  getSelfImprovementTarget,
  listConsideredProposalTitles,
  insertProposals,
} from "@/db/queries/frontier";
import { listActiveGoalsWithMilestones } from "@/db/queries/goals";
import { FLEET_RUNNER_RELEASES } from "@/config/changelog";
import type { FrontierDigestRow } from "@/db/schema";

export type RunFrontierResult = {
  saved: FrontierDigestRow;
  sourcesOk: number;
  sourcesFailed: number;
  candidateCount: number;
  itemCount: number;
};

export async function runFrontierDigest(nowMs = Date.now()): Promise<RunFrontierResult> {
  const { candidates, sourcesOk, sourcesFailed } = await ingestFrontier(nowMs);
  const result = await generateFrontierDigest(candidates);

  const saved = await upsertFrontierDigest({
    digestDate: new Date(nowMs).toISOString().slice(0, 10),
    headline: result.headline,
    intro: result.intro,
    items: result.items,
    candidateCount: candidates.length,
    sourceCount: sourcesOk,
    model: result.model,
  });

  return { saved, sourcesOk, sourcesFailed, candidateCount: candidates.length, itemCount: result.items.length };
}

export type RunProposalsResult = {
  skipped?: "no-target" | "no-items";
  drafted: number;
  surfaced: number;
  /** Every draft with its panel verdict — makes the loop observable (you can
   *  see what was proposed and why it did/didn't clear the bar), not a black box. */
  details?: { title: string; score: number; passed: boolean; judges: { model: string; score: number }[] }[];
  /**
   * Why the generator produced what it produced. `drafted: 0` used to be the
   * whole story, and it covered four different faults with four different
   * fixes — which is why the loop went from 2026-06-24 to 2026-08-25 without
   * surfacing a proposal and nobody could say what was wrong with it.
   */
  generation?: GenerationOutcome;
  /** Present only when the generator's model call threw. */
  generationError?: string;
  /** The head of a reply that would not parse whole — set for `unparseable`,
   *  and also when the reply was TRUNCATED (even if complete proposals were
   *  salvaged from it), so the next fix does not start by reproducing the call. */
  generationRawSample?: string;
  /** Proposals the model returned before dedup. `returned > 0` with
   *  `drafted: 0` means WE discarded them, not that the model had no ideas. */
  returned?: number;
  /** Judges that could not vote. A non-empty list means any rejection below
   *  was reached by a DEGRADED panel — fewer votes than the design assumes. */
  judgeFailures?: { model: string; error: string }[];
  /** No judge voted at all. Everything fails closed, correctly, but for a
   *  reason unrelated to proposal quality. Never read this as a rejection. */
  panelUnreachable?: boolean;
};

/** The self-improvement half: draft proposals from a digest, critique them,
 *  store only those that clear the bar. Never auto-builds — a human decides. */
export async function runFrontierProposals(digest: FrontierDigestRow): Promise<RunProposalsResult> {
  if (!digest.items || digest.items.length === 0) return { skipped: "no-items", drafted: 0, surfaced: 0 };

  const target = await getSelfImprovementTarget();
  if (!target) return { skipped: "no-target", drafted: 0, surfaced: 0 };

  const [activeGoals, consideredTitles] = await Promise.all([
    // Scope to the FleetCrown entity so grounding uses engineering gaps, not the
    // owner's unrelated personal life-OS goals (financial independence, burn, …).
    listActiveGoalsWithMilestones(target.userId, target.entityId),
    listConsideredProposalTitles(target.userId),
  ]);

  // Open milestones across active goals = the declared gaps to fill.
  const openGaps = activeGoals
    .flatMap((g) => (g.milestones ?? []).filter((m) => !m.done).map((m) => `${g.title}: ${m.title}`))
    .slice(0, 16);
  // Recently shipped, user-facing features — build on these, don't repropose.
  const recentlyShipped = FLEET_RUNNER_RELEASES.slice(0, 6).flatMap((r) => r.highlights).slice(0, 12);

  const generation = await generateProposals(digest.items, {
    activeGoalTitles: activeGoals.map((g) => g.title),
    consideredTitles,
    openGaps,
    recentlyShipped,
  });
  const drafts = generation.drafts;
  if (drafts.length === 0) {
    return {
      drafted: 0, surfaced: 0, details: [],
      generation: generation.outcome,
      returned: generation.returned,
      ...(generation.error ? { generationError: generation.error } : {}),
      ...(generation.rawSample ? { generationRawSample: generation.rawSample } : {}),
    };
  }

  const { verified, judgeFailures, panelUnreachable } = await verifyProposals(drafts);
  const details = verified.map((p) => ({ title: p.title, score: p.score, passed: p.passed, judges: p.verifierScores }));
  const survivors = verified.filter((p) => p.passed);
  const panel = {
    generation: generation.outcome,
    returned: generation.returned,
    // Present when the reply was cut off but complete proposals were salvaged:
    // the run WORKED, on less than the model tried to say. Worth seeing before
    // it becomes a night that yields nothing.
    ...(generation.rawSample ? { generationRawSample: generation.rawSample } : {}),
    ...(judgeFailures.length ? { judgeFailures } : {}),
    ...(panelUnreachable ? { panelUnreachable } : {}),
  };
  if (survivors.length === 0) return { drafted: drafts.length, surfaced: 0, details, ...panel };

  await insertProposals(survivors.map((p) => ({
    digestDate: digest.digestDate,
    userId: target.userId,
    entityId: target.entityId,
    title: p.title,
    rationale: p.rationale,
    sourceUrls: p.sourceUrls,
    score: p.score,
    verifierScores: p.verifierScores,
    status: "proposed",
  })));

  return { drafted: drafts.length, surfaced: survivors.length, details, ...panel };
}
