import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getFeedbackWithProject, setFeedbackStatus } from "@/db/queries/site-feedback";
import { getOrchestrationRunById } from "@/db/queries/orchestration-runs";
import { injectPrompt } from "@/lib/inject-core";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { composeFeedbackFixPrompt } from "@/lib/feedback/compose-dispatch";
import { ORCH_STATE } from "@/lib/orchestration/contract";

/**
 * One-click Implement: queue a scoped agent run via injectPrompt.
 * Returns runId when accepted. Allows Retry when a prior run is stuck/failed
 * (not while a run is actively working).
 */

const DispatchBody = z.object({
  note: z.string().trim().max(500).optional(),
});

function isActivelyWorking(state: string, startedAt: Date, deliveredAt: string | null): boolean {
  if (state === ORCH_STATE.RUNNING) return true;
  if (state !== ORCH_STATE.WAITING && state !== ORCH_STATE.IDLE) return false;
  const age = Date.now() - startedAt.getTime();
  if (age < 90_000) return true; // still starting
  if (deliveredAt && age < 10 * 60_000) return true; // may still be thinking
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const row = await getFeedbackWithProject(userId, idOrResp);
  if (!row) return jsonError("Not found", 404);
  if (row.feedback.status === FEEDBACK_STATUS.RESOLVED || row.feedback.status === FEEDBACK_STATUS.ARCHIVED) {
    return jsonError("Reopen the item before dispatching again", 409);
  }
  if (row.feedback.status === FEEDBACK_STATUS.DISPATCHED && row.feedback.dispatchedRunId) {
    const run = await getOrchestrationRunById(userId, row.feedback.dispatchedRunId);
    if (run) {
      const deliveredAt = (run.payload as { deliveredAt?: string } | null)?.deliveredAt ?? null;
      if (isActivelyWorking(run.state, run.startedAt, deliveredAt)) {
        return jsonError("Already working on this — open Control to watch", 409);
      }
    }
  }

  const { status, body } = await injectPrompt(
    {
      tab: row.projectName,
      customPrompt: composeFeedbackFixPrompt(row.feedback, row.projectName, dataOrResp.note || undefined),
      notifyOnClose: true,
    },
    userId,
  );
  if (status < 400) {
    const runId = typeof body.runId === "string" ? body.runId : undefined;
    await setFeedbackStatus(userId, idOrResp, FEEDBACK_STATUS.DISPATCHED, runId);
  }
  return NextResponse.json(
    {
      ...body,
      workLabel: status < 400 ? "Queued" : undefined,
    },
    { status },
  );
}
