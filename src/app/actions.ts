"use server";

import { approveAction, rejectAction } from "@/db/queries/actions";
import type { ActionRow } from "@/db/queries/actions";
import { dismissAlert } from "@/db/queries/alerts";
import { fulfillCommitment } from "@/db/queries/today";
import { cancelSubscription } from "@/db/queries/money";
import { createInteraction } from "@/db/queries/people";
import { patchGoal } from "@/db/queries/goals";
import { executeAction } from "@/lib/actions/execute-action";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { ROUTES } from "@/config/auth";
import { GOAL_STATUS } from "@/lib/constants/statuses";
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
async function finalizeApproved(userId: string, action: ActionRow): Promise<void> {
  if (action.entityId && INTERACTION_ACTION_TYPES.has(action.type)) {
    await createInteraction(userId, {
      entityId: action.entityId,
      channel: String(action.payload?.channel ?? "other"),
      direction: INTERACTION_DIRECTION.OUTBOUND,
      summary: action.title,
    });
  }
  await recordActionAuditEvent(userId, action, "approved");
  await executeAction(userId, action);
}

export async function handleApprove(id: string) {
  const userId = await requirePageUserId();
  const [action] = await approveAction(id, userId);
  if (action) await finalizeApproved(userId, action);
  revalidatePath(ROUTES.APP_HOME);
  revalidatePath("/people");
}

export async function handleApproveAll(ids: string[]) {
  const userId = await requirePageUserId();
  const results = await Promise.all(ids.map((id) => approveAction(id, userId)));
  const approved = results.flat();
  await Promise.all(approved.map((action) => finalizeApproved(userId, action)));
  revalidatePath(ROUTES.APP_HOME);
  revalidatePath("/people");
}

export async function handleReject(id: string) {
  const userId = await requirePageUserId();
  const [action] = await rejectAction(id, userId);
  if (action) await recordActionAuditEvent(userId, action, "rejected");
  revalidatePath(ROUTES.APP_HOME);
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
