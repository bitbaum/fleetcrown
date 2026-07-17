import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, jsonOk, jsonError, z } from "@/lib/api/route-helpers";
import { getSessionUserId } from "@/lib/session";
import { setFeedbackStatus } from "@/db/queries/site-feedback";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";

/**
 * Triage a feedback item. NOTE: /api/feedback is excluded from the auth
 * middleware (the public ingest lives there), so the session check below is
 * the ONLY gate on this handler — do not remove it.
 */

const PatchBody = z.object({
  // `dispatched` is set by the dispatch flow, not by manual triage.
  status: z.enum([FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.RESOLVED, FEEDBACK_STATUS.ARCHIVED]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, PatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const updated = await setFeedbackStatus(userId, idOrResp, dataOrResp.status);
  if (!updated) return jsonError("Not found", 404);
  return jsonOk({ feedback: updated });
}
