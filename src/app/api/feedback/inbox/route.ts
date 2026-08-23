import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { getFeedbackLoopMetrics, listUserFeedback } from "@/db/queries/site-feedback";
import { attachFeedbackWork } from "@/lib/feedback/attach-work";

/**
 * The cross-project feedback inbox behind /feedback: every project's rows in
 * one payload, each with its project name and honest work phase, plus the
 * fleet-wide loop metrics. Per-project actions keep their existing id-scoped
 * routes — this is a read lens, not a second write path.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const [raw, metrics] = await Promise.all([
    listUserFeedback(userId),
    getFeedbackLoopMetrics(userId).catch(() => null),
  ]);
  const feedback = await attachFeedbackWork(userId, raw);
  return jsonOk({ feedback, metrics });
}
