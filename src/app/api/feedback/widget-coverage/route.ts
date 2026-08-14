import { jsonOk, jsonError } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { listWidgetCoverage } from "@/db/queries/widget-tokens";

/**
 * Fleet-wide widget coverage for Control: which site-like projects are missing
 * an active live embed. Auth required (same pattern as /api/feedback/summary).
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const coverage = await listWidgetCoverage(userId);
  return jsonOk({
    coverage,
    needsAttention: coverage.filter((c) => c.needsAttention),
  });
}
