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
import { getCurrentClaudeSessionForProject } from "@/db/queries/agent-sessions";
import { DEFAULT_ADAPTER_ID, ORCHESTRATION_ADAPTER_IDS, type AdapterId } from "@/lib/orchestration";

/**
 * One-click Implement: queue a scoped agent run via injectPrompt.
 * Returns runId when accepted. Allows Retry when a prior run is stuck/failed
 * (not while a run is queued or actively working).
 *
 * Agent choice: the project's agentPref when it is an orchestration adapter the
 * runner can launch. Claude is the only worker with a durable session id today,
 * so session resume applies only when the chosen adapter is Claude. openclaw is
 * accepted by orchestration ids but is not launchable — fall through to default.
 */

const DispatchBody = z.object({
  note: z.string().trim().max(500).optional(),
});

/** Adapters Implement may start. openclaw is orchestration-listed but not launchable. */
const IMPLEMENT_ADAPTERS = ORCHESTRATION_ADAPTER_IDS.filter((id) => id !== "openclaw");

function resolveImplementAdapter(agentPref: string | null | undefined): AdapterId {
  if (agentPref && (IMPLEMENT_ADAPTERS as readonly string[]).includes(agentPref)) {
    return agentPref as AdapterId;
  }
  return DEFAULT_ADAPTER_ID;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, DispatchBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const row = await getFeedbackWithProject(userId, idOrResp);
  if (!row) return jsonError("Feedback not found", 404);

  // Verify the project actually exists in user_projects before dispatching.
  // This prevents creating runs for projects that can't be found by inject.
  if (!row.projectName) {
    return jsonError(
      "Project configuration not found. The project may need to be re-registered on the Projects page.",
      422,
    );
  }

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

  const adapter = resolveImplementAdapter(row.agentPref);
  const currentSession =
    adapter === "claude" ? await getCurrentClaudeSessionForProject(userId, row.projectName) : null;

  const { status, body } = await injectPrompt(
    {
      tab: row.projectName,
      adapter,
      sessionId: currentSession?.sessionId,
      customPrompt: composeFeedbackFixPrompt(
        row.feedback,
        row.projectName,
        dataOrResp.note || undefined,
      ),
      notifyOnClose: true,
    },
    userId,
  );

  // Only mark as dispatched if the injection succeeded (status < 400).
  // This ensures failed injections (e.g. "Unknown tab") don't mark the
  // feedback as dispatched, which would make it look like work started
  // when it never did.
  if (status < 400) {
    const runId = typeof body.runId === "string" ? body.runId : undefined;
    await setFeedbackStatus(userId, idOrResp, FEEDBACK_STATUS.DISPATCHED, runId);
  }

  // Return detailed error messages to help the operator understand what went wrong
  return NextResponse.json(
    {
      ...body,
      adapter,
      sessionId: currentSession?.sessionId ?? null,
      sessionAction: adapter === "claude" ? (currentSession ? "resumed" : "started") : "started",
      workLabel: status < 400 ? "Queued" : undefined,
      // Add helpful context for common failures
      ...(status === 404 && {
        hint: "The project may need to be registered on the Projects page, or the agent may need to be started.",
      }),
    },
    { status },
  );
}
