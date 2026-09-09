import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getFeedbackWithProject, setFeedbackStatus } from "@/db/queries/site-feedback";
import { getOrchestrationRunById } from "@/db/queries/orchestration-runs";
import { injectPrompt } from "@/lib/inject-core";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { composeFeedbackFixPrompt } from "@/lib/feedback/compose-dispatch";
import { deriveFeedbackWork, FEEDBACK_WORK_PHASE } from "@/lib/feedback/work-phase";
import { runToFeedbackSnapshot } from "@/lib/feedback/attach-work";
import { resolveEffectiveTab } from "@/lib/agent-config";
import { getZellijTabs } from "@/lib/zellij";
import { isRuntimeAvailable } from "@/lib/runtime";

/**
 * One-click Implement: queue a scoped agent run via injectPrompt.
 * Returns runId when accepted. Allows Retry when a prior run is stuck/failed
 * (not while a run is queued or actively working).
 */

const DispatchBody = z.object({
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const row = await getFeedbackWithProject(userId, idOrResp);
  if (!row) return jsonError("Not found", 404);
  if (
    row.feedback.status === FEEDBACK_STATUS.RESOLVED ||
    row.feedback.status === FEEDBACK_STATUS.ARCHIVED
  ) {
    return jsonError("Reopen the item before dispatching again", 409);
  }
  if (row.feedback.status === FEEDBACK_STATUS.DISPATCHED) {
    // Same derivation the badges render — the gate and the UI can't disagree.
    // QUEUED/WORKING → refuse the duplicate; STUCK/FAILED (including a
    // dispatched row whose run record is missing) → allow the retry.
    const run = row.feedback.dispatchedRunId
      ? await getOrchestrationRunById(userId, row.feedback.dispatchedRunId)
      : null;
    const work = deriveFeedbackWork(row.feedback.status, runToFeedbackSnapshot(run));
    if (work.phase === FEEDBACK_WORK_PHASE.QUEUED || work.phase === FEEDBACK_WORK_PHASE.WORKING) {
      return jsonError("Already working on this — open Control to watch", 409);
    }
  }

  // Resolve project name to live tab name using the same logic Control uses.
  // When project "fleetcrown" runs as tab "Bitbaum", injectPrompt must receive
  // "Bitbaum" or focus_tab fails with "tab not found".
  const zellijTabs = isRuntimeAvailable() ? await getZellijTabs() : [];
  const effectiveTab = resolveEffectiveTab(row.projectName, zellijTabs);

  const { status, body } = await injectPrompt(
    {
      tab: effectiveTab,
      customPrompt: composeFeedbackFixPrompt(
        row.feedback,
        row.projectName,
        dataOrResp.note || undefined,
      ),
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
