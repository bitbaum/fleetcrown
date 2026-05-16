"use server";

import { approveAction, rejectAction } from "@/db/queries/actions";
import { dismissAlert } from "@/db/queries/alerts";
import { fulfillCommitment } from "@/db/queries/today";
import { cancelSubscription } from "@/db/queries/money";
import { createInteraction } from "@/db/queries/people";
import { patchGoal } from "@/db/queries/goals";
import { getCurrentUserId } from "@/lib/session";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { ACTION_TYPE, type ActionType, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import { revalidatePath } from "next/cache";

const INTERACTION_ACTION_TYPES = new Set<ActionType>([
  ACTION_TYPE.SEND_MESSAGE,
  ACTION_TYPE.SEND_EMAIL,
  ACTION_TYPE.FOLLOW_UP,
]);

export async function handleApprove(id: string) {
  const userId = await getCurrentUserId();
  const [action] = await approveAction(id, userId);
  if (action?.entityId && INTERACTION_ACTION_TYPES.has(action.type)) {
    const channel = action.payload?.channel ?? "other";
    await createInteraction(userId, {
      entityId: action.entityId,
      channel,
      direction: INTERACTION_DIRECTION.OUTBOUND,
      summary: action.title,
    });
  }
  revalidatePath("/today");
  revalidatePath("/people");
}

export async function handleApproveAll(ids: string[]) {
  const userId = await getCurrentUserId();
  const results = await Promise.all(ids.map((id) => approveAction(id, userId)));
  const approved = results.flat();
  await Promise.all(
    approved
      .filter((a) => a.entityId && INTERACTION_ACTION_TYPES.has(a.type as ActionType))
      .map((a) =>
        createInteraction(userId, {
          entityId: a.entityId!,
          channel: String(a.payload?.channel ?? "other"),
          direction: INTERACTION_DIRECTION.OUTBOUND,
          summary: a.title,
        }),
      ),
  );
  revalidatePath("/today");
  revalidatePath("/people");
}

export async function handleReject(id: string) {
  const userId = await getCurrentUserId();
  await rejectAction(id, userId);
  revalidatePath("/today");
}

export async function handleDismissAlert(id: string) {
  const userId = await getCurrentUserId();
  await dismissAlert(id, userId);
  revalidatePath("/today");
}

export async function handleFulfillCommitment(id: string) {
  const userId = await getCurrentUserId();
  await fulfillCommitment(id, userId);
  revalidatePath("/today");
}

export async function handleCancelSubscription(id: string) {
  const userId = await getCurrentUserId();
  await cancelSubscription(id, userId);
  revalidatePath("/money");
}

export async function handleAbandonGoal(id: string) {
  const userId = await getCurrentUserId();
  await patchGoal(userId, id, { status: GOAL_STATUS.ABANDONED });
  revalidatePath("/today");
  revalidatePath("/goals");
}
