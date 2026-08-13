"use server";

import { approveAction, rejectAction, getActionById, updateDraftPayload } from "@/db/queries/actions";
import type { ActionRow } from "@/db/queries/actions";
import { setFeedbackStatus } from "@/db/queries/site-feedback";
import { planTrim } from "@/lib/actions/advisor";
import { RECOMMENDATION, type Recommendation } from "@/lib/actions/advice-rules";
import { dismissAlert } from "@/db/queries/alerts";
import { fulfillCommitment } from "@/db/queries/today";
import { cancelSubscription } from "@/db/queries/money";
import { createInteraction } from "@/db/queries/people";
import { patchGoal } from "@/db/queries/goals";
import { executeAction, type ExecuteActionResult } from "@/lib/actions/execute-action";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { ROUTES } from "@/config/auth";
import { GOAL_STATUS, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { ACTION_TYPE, type ActionType, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import { revalidatePath } from "next/cache";

const INTERACTION_ACTION_TYPES = new Set<ActionType>([
  ACTION_TYPE.SEND_MESSAGE,
  ACTION_TYPE.SEND_EMAIL,
  ACTION_TYPE.FOLLOW_UP,
]);

/**
 * Shared post-approval path: log the outbound interaction (for message types),
 * audit the approval, then run the executor. The executor is fail-closed — it
 * only advances the row to 'executed' on a real successful effect; external
 * types are deferred and audited (see lib/actions/execute-action.ts).
 */
async function finalizeApproved(userId: string, action: ActionRow): Promise<ExecuteActionResult> {
  if (action.entityId && INTERACTION_ACTION_TYPES.has(action.type)) {
    await createInteraction(userId, {
      entityId: action.entityId,
      channel: String(action.payload?.channel ?? "other"),
      direction: INTERACTION_DIRECTION.OUTBOUND,
      summary: action.title,
    });
  }
  await recordActionAuditEvent(userId, action, "approved");
  return executeAction(userId, action);
}

export async function handleApprove(id: string): Promise<ExecuteActionResult> {
  const userId = await requirePageUserId();
  const [action] = await approveAction(id, userId);
  if (!action) return { executed: false, error: "not-found" };
  // Caller refreshes when the result is on screen. Immediate revalidate
  // deletes the card before the operator sees where the work went.
  return finalizeApproved(userId, action);
}

export async function handleApproveAll(ids: string[]): Promise<{ count: number }> {
  const userId = await requirePageUserId();
  const results = await Promise.all(ids.map((id) => approveAction(id, userId)));
  const approved = results.flat();
  await Promise.all(approved.map((action) => finalizeApproved(userId, action)));
  return { count: approved.length };
}

export async function handleReject(id: string) {
  const userId = await requirePageUserId();
  const [action] = await rejectAction(id, userId);
  if (action) await recordActionAuditEvent(userId, action, "rejected");
  revalidatePath(ROUTES.APP_HOME);
}

/** Archive the feedback rows an action clustered, so a rejected or trimmed-away
 *  submission stops coming back as next week's identical proposal. Best-effort:
 *  triage bookkeeping must never fail the decision the operator just made. */
async function archiveFeedback(userId: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      setFeedbackStatus(userId, id, FEEDBACK_STATUS.ARCHIVED).catch(() => null),
    ),
  );
}

/**
 * Apply one option from the Approval Queue advisor.
 *
 * `dispatch_trimmed` is the reason this exists rather than the popup just
 * calling approve/reject: it rewrites the draft's prompt to carry only the
 * credible reports, archives the ones it dropped, and only then approves. The
 * approval itself still goes through approveAction + finalizeApproved, so the
 * IRON RULE holds — draft → approved → executed, no bypass.
 */
export async function handleApplyAdvice(
  id: string,
  option: Recommendation,
): Promise<ExecuteActionResult | { executed: false; skipped: true }> {
  const userId = await requirePageUserId();

  if (option === RECOMMENDATION.REVIEW) return { executed: false, skipped: true };

  const action = await getActionById(userId, id);
  if (!action) return { executed: false, error: "not-found" };
  const feedbackIds = Array.isArray(action.payload?.feedbackIds)
    ? (action.payload.feedbackIds as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  if (option === RECOMMENDATION.SKIP) {
    await handleReject(id);
    await archiveFeedback(userId, feedbackIds);
    return { executed: false, skipped: true };
  }

  if (option === RECOMMENDATION.DISPATCH_TRIMMED) {
    const plan = planTrim({
      id: action.id,
      title: action.title,
      type: action.type,
      payload: action.payload,
      createdAt: action.createdAt,
      expiresAt: action.expiresAt,
    });
    // No plan means nothing was trimmable after all (payload edited since the
    // advice was fetched). Fall through to a plain dispatch rather than
    // silently approving a prompt the operator did not see.
    if (plan) {
      await updateDraftPayload(id, userId, {
        ...action.payload,
        body: plan.body,
        feedbackIds: plan.keepFeedbackIds,
      });
      await archiveFeedback(userId, plan.dropFeedbackIds);
    }
  }

  return handleApprove(id);
}

export async function handleDismissAlert(id: string) {
  const userId = await requirePageUserId();
  await dismissAlert(id, userId);
  revalidatePath(ROUTES.APP_HOME);
}

export async function handleFulfillCommitment(id: string) {
  const userId = await requirePageUserId();
  if (await isPrivateZoneLocked(userId)) return; // UI should not call when locked
  await fulfillCommitment(id, userId);
  revalidatePath(ROUTES.APP_HOME);
}

export async function handleCancelSubscription(id: string) {
  const userId = await requirePageUserId();
  await cancelSubscription(id, userId);
  revalidatePath("/money");
}

export async function handleAbandonGoal(id: string) {
  const userId = await requirePageUserId();
  if (await isPrivateZoneLocked(userId)) return; // UI should not call when locked; private page gated
  await patchGoal(userId, id, { status: GOAL_STATUS.ABANDONED });
  revalidatePath(ROUTES.APP_HOME);
  revalidatePath("/goals");
}
