// One-call orchestration for the daily frontier digest: ingest → rank → store.
// Shared by the cron route and the manual seed script so the pipeline has a
// single entry point (SSOT).

import { ingestFrontier } from "./ingest";
import { generateFrontierDigest } from "./digest";
import { generateProposals, critiqueProposals, PROPOSAL_SCORE_THRESHOLD } from "./propose";
import {
  upsertFrontierDigest,
  getSelfImprovementTarget,
  listConsideredProposalTitles,
  insertProposals,
} from "@/db/queries/frontier";
import { listActiveGoals } from "@/db/queries/goals";
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
};

/** The self-improvement half: draft proposals from a digest, critique them,
 *  store only those that clear the bar. Never auto-builds — a human decides. */
export async function runFrontierProposals(digest: FrontierDigestRow): Promise<RunProposalsResult> {
  if (!digest.items || digest.items.length === 0) return { skipped: "no-items", drafted: 0, surfaced: 0 };

  const target = await getSelfImprovementTarget();
  if (!target) return { skipped: "no-target", drafted: 0, surfaced: 0 };

  const [activeGoals, consideredTitles] = await Promise.all([
    listActiveGoals(target.userId),
    listConsideredProposalTitles(target.userId),
  ]);

  const drafts = await generateProposals(digest.items, {
    activeGoalTitles: activeGoals.map((g) => g.title),
    consideredTitles,
  });
  if (drafts.length === 0) return { drafted: 0, surfaced: 0 };

  const scored = await critiqueProposals(drafts);
  const survivors = scored.filter((p) => p.score >= PROPOSAL_SCORE_THRESHOLD);
  if (survivors.length === 0) return { drafted: drafts.length, surfaced: 0 };

  await insertProposals(survivors.map((p) => ({
    digestDate: digest.digestDate,
    userId: target.userId,
    entityId: target.entityId,
    title: p.title,
    rationale: p.rationale,
    sourceUrls: p.sourceUrls,
    score: p.score,
    status: "proposed",
  })));

  return { drafted: drafts.length, surfaced: survivors.length };
}
