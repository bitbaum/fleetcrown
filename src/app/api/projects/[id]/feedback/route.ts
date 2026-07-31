import { NextRequest, NextResponse } from "next/server";
import { readIdParam, jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { getFeedbackLoopMetrics, listProjectFeedback } from "@/db/queries/site-feedback";

/** Per-project feedback inbox (visitor submissions from the embed widget)
 *  plus the loop metrics (resolved count, median report→fix). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const [feedback, metrics] = await Promise.all([
    listProjectFeedback(userId, idOrResp),
    getFeedbackLoopMetrics(userId, idOrResp).catch(() => null),
  ]);
  return jsonOk({ feedback, metrics });
}
