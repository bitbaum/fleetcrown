// One-call orchestration for the daily frontier digest: ingest → rank → store.
// Shared by the cron route and the manual seed script so the pipeline has a
// single entry point (SSOT).

import { ingestFrontier } from "./ingest";
import { generateFrontierDigest } from "./digest";
import { generateProposals, verifyProposals } from "./propose";
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

  const drafts = await generateProposals(digest.items, {
    activeGoalTitles: activeGoals.map((g) => g.title),
    consideredTitles,
    openGaps,
    recentlyShipped,
  });
  if (drafts.length === 0) return { drafted: 0, surfaced: 0, details: [] };

  const verified = await verifyProposals(drafts);
  const details = verified.map((p) => ({ title: p.title, score: p.score, passed: p.passed, judges: p.verifierScores }));
  const survivors = verified.filter((p) => p.passed);
  if (survivors.length === 0) return { drafted: drafts.length, surfaced: 0, details };

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

  return { drafted: drafts.length, surfaced: survivors.length, details };
}
