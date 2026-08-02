import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getOrchestrationRunById, updateOrchestrationRun } from "@/db/queries/orchestration-runs";
import { priceUsage } from "@/config/model-pricing";
import type { OrchestrationRunUsageDetail } from "@/db/schema/orchestration-runs";

/**
 * POST /api/orchestration/runs/:id/usage — runner-reported token usage.
 *
 * The runner recomputes the run's CUMULATIVE usage window ([deliveredAt, now]
 * over the agent's own transcript) every heartbeat and posts totals here, so
 * each report simply REPLACES the last — no increment bookkeeping, and a
 * missed heartbeat loses nothing. Pricing happens here (box-side) against
 * src/config/model-pricing.ts so rate changes never require a runner release.
 *
 * Freeze rule: while the run is open every report lands. After the run
 * closes, exactly ONE more report is accepted (the tail between the last
 * heartbeat and close), flagged `final` — anything later is refused with
 * `done: true`, which is also the runner's signal to stop tracking. Without
 * this, a long-lived session's NEXT run in the same cwd would keep extending
 * this run's window and leak its tokens backwards.
 */

const totalsShape = {
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
};

const UsageBody = z.object({
  totals: z.object(totalsShape),
  models: z.record(z.string().max(120), z.object(totalsShape)).optional(),
  sessionIds: z.array(z.string().max(80)).max(20).optional(),
  windowTo: z.iso.datetime().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const dataOrResp = await readJsonBody(req, UsageBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const body = dataOrResp;

  const run = await getOrchestrationRunById(userId, id);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const closed = run.finishedAt != null;
  if (closed && run.usageDetail?.final) {
    return NextResponse.json({ ok: true, done: true });
  }

  const models = body.models ?? {};
  const { costUsd, unpricedModels } = priceUsage(models);
  const detail: OrchestrationRunUsageDetail = {
    models,
    sessionIds: body.sessionIds,
    unpricedModels: unpricedModels.length ? unpricedModels : undefined,
    windowTo: body.windowTo,
    final: closed || undefined,
  };

  await updateOrchestrationRun(id, {
    tokensIn: body.totals.input,
    tokensOut: body.totals.output,
    tokensCacheRead: body.totals.cacheRead,
    tokensCacheWrite: body.totals.cacheWrite,
    costUsd,
    usageDetail: detail,
    usageUpdatedAt: new Date(),
  }, userId);

  return NextResponse.json({ ok: true, done: closed });
}
