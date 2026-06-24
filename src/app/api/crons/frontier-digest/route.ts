// Cron target — generates the daily public frontier digest.
//
// Runs once a day. Ingests the curated AI/robotics/frontier sources, has Groq
// rank + summarize the pool, and upserts today's row in frontier_digests
// (idempotent per day). The public /frontier page renders the latest row.
//
// Auth: requireCronAuth — the cron caller sends Authorization: Bearer
// ${CRON_SECRET}. Local dev with no CRON_SECRET is permitted (cron-auth.ts).

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { runFrontierDigest, runFrontierProposals } from "@/lib/frontier/run";

// Ingestion fans out to several external feeds + a Groq call; give it room.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const r = await runFrontierDigest();
    // Second half: draft + critique self-improvement proposals from the digest.
    // Best-effort — a proposal failure must not fail the public digest.
    let proposals: Awaited<ReturnType<typeof runFrontierProposals>> | { error: string };
    try {
      proposals = await runFrontierProposals(r.saved);
    } catch (e) {
      proposals = { error: e instanceof Error ? e.message : "unknown" };
    }
    return NextResponse.json({
      ok: true,
      digestDate: r.saved.digestDate,
      items: r.itemCount,
      candidates: r.candidateCount,
      sourcesOk: r.sourcesOk,
      sourcesFailed: r.sourcesFailed,
      model: r.saved.model,
      proposals,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
