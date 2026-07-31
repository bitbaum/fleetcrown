import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { getFeedbackLoopMetrics, listFeedbackSummary } from "@/db/queries/site-feedback";

/**
 * Fleet-wide feedback lens: per-project NEW counts for the /control strip,
 * plus the fleet-wide loop metrics (resolved count, median report→fix).
 * NOTE: /api/feedback is excluded from the auth middleware (the public ingest
 * lives there), so the session check below is the ONLY gate — do not remove.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const [summary, loop] = await Promise.all([
    listFeedbackSummary(userId),
    getFeedbackLoopMetrics(userId).catch(() => null),
  ]);
  return jsonOk({ summary, loop });
}
