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
import { logDebug } from "@/db/queries/debug-logs";
import { runFrontierDigest, runFrontierProposals, type RunProposalsResult } from "@/lib/frontier/run";

/**
 * How loud each generator outcome is. The distinction that matters: a fault in
 * the machinery (a dead model, a reply we cannot read, a panel that never
 * voted) needs a fix, while "the model saw no match today" is the loop working
 * as designed. Both used to end in the same `drafted: 0`.
 *
 * `error` also buys retention — prune-debug-logs keeps errors 90 days and
 * info/warn 30, so the rows worth a postmortem are the ones that survive to
 * have one.
 */
function outcomeLevel(p: RunProposalsResult): "info" | "warn" | "error" {
  if (p.generation === "call-failed" || p.generation === "unparseable" || p.generation === "truncated") return "error";
  if (p.panelUnreachable) return "error";
  if (p.skipped || p.generation === "no-items" || p.judgeFailures?.length) return "warn";
  return "info";
}

// Ingestion fans out to several external feeds + a Groq call; give it room.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const r = await runFrontierDigest();
    // Second half: draft + critique self-improvement proposals from the digest.
    // Best-effort — a proposal failure must not fail the public digest.
    let proposals: RunProposalsResult | { error: string };
    try {
      proposals = await runFrontierProposals(r.saved);
    } catch (e) {
      proposals = { error: e instanceof Error ? e.message : "unknown" };
    }

    // Persist the outcome. Until this existed the whole diagnosis lived in the
    // systemd journal, which on this box holds ONE day of this unit — so the
    // loop could (and did) go two months surfacing nothing with no recoverable
    // record of why. The response body is written once and read by nobody.
    await logDebug({
      source: "crons/frontier-digest",
      level: "error" in proposals ? "error" : outcomeLevel(proposals),
      message: "error" in proposals
        ? `frontier proposals THREW: ${proposals.error}`
        : proposals.skipped
          ? `no proposals attempted: ${proposals.skipped}`
          : `generation=${proposals.generation} returned=${proposals.returned ?? 0} drafted=${proposals.drafted} surfaced=${proposals.surfaced}`,
      meta: {
        digestDate: r.saved.digestDate,
        items: r.itemCount,
        sourcesOk: r.sourcesOk,
        sourcesFailed: r.sourcesFailed,
        model: r.saved.model,
        proposals,
      },
    });

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
    // The digest half itself failed, so there is no digest row to look at
    // later. This is the only durable trace that the job ran at all.
    await logDebug({
      source: "crons/frontier-digest",
      level: "error",
      message: `frontier digest FAILED: ${message}`,
      meta: { stack: err instanceof Error ? err.stack : null },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
