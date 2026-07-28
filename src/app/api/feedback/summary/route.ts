import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { listFeedbackSummary } from "@/db/queries/site-feedback";

/**
 * Fleet-wide feedback lens: per-project NEW counts for the /control strip.
 * NOTE: /api/feedback is excluded from the auth middleware (the public ingest
 * lives there), so the session check below is the ONLY gate — do not remove.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const summary = await listFeedbackSummary(userId);
  return jsonOk({ summary });
}
