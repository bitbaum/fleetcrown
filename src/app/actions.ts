"use server";

import { approveAction, rejectAction } from "@/db/queries/actions";
import { dismissAlert } from "@/db/queries/alerts";
import { fulfillCommitment } from "@/db/queries/today";
import { cancelSubscription } from "@/db/queries/money";
import { createInteraction } from "@/db/queries/people";
import { ACTION_TYPE, type ActionType, INTERACTION_DIRECTION } from "@/lib/constants/statuses";
import { revalidatePath } from "next/cache";

// Action types that imply a real-world interaction with a person occurred
const INTERACTION_ACTION_TYPES = new Set<ActionType>([
  ACTION_TYPE.SEND_MESSAGE,
  ACTION_TYPE.SEND_EMAIL,
  ACTION_TYPE.FOLLOW_UP,
]);

export async function handleApprove(id: string) {
  const [action] = await approveAction(id);
  // If this action is linked to a person and represents a communication,
  // log an interaction so the contact health score updates immediately.
  if (action?.entityId && INTERACTION_ACTION_TYPES.has(action.type)) {
    const channel = action.payload?.channel ?? "other";
    await createInteraction({
      entityId: action.entityId,
      channel,
      direction: INTERACTION_DIRECTION.OUTBOUND,
      summary: action.title,
    });
  }
  revalidatePath("/today");
  revalidatePath("/people");
}

export async function handleReject(id: string) {
  await rejectAction(id);
  revalidatePath("/today");
}

export async function handleDismissAlert(id: string) {
  await dismissAlert(id);
  revalidatePath("/today");
}

export async function handleFulfillCommitment(id: string) {
  await fulfillCommitment(id);
  revalidatePath("/today");
}

export async function handleCancelSubscription(id: string) {
  await cancelSubscription(id);
  revalidatePath("/money");
}
