import { NextRequest, NextResponse } from "next/server";
import { readIdParam, jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { getFeedbackLoopMetrics, listProjectFeedback } from "@/db/queries/site-feedback";
import { attachFeedbackWork } from "@/lib/feedback/attach-work";

/** Per-project feedback inbox (visitor submissions from the embed widget)
 *  plus the loop metrics (resolved count, median report→fix). Each row
 *  includes `work` — honest phase/label (not started / queued / working / …). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const [raw, metrics] = await Promise.all([
    listProjectFeedback(userId, idOrResp),
    getFeedbackLoopMetrics(userId, idOrResp).catch(() => null),
  ]);
  const feedback = await attachFeedbackWork(userId, raw);
  return jsonOk({ feedback, metrics });
}
