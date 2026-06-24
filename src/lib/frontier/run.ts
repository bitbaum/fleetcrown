// One-call orchestration for the daily frontier digest: ingest → rank → store.
// Shared by the cron route and the manual seed script so the pipeline has a
// single entry point (SSOT).

import { ingestFrontier } from "./ingest";
import { generateFrontierDigest } from "./digest";
import { upsertFrontierDigest } from "@/db/queries/frontier";
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
