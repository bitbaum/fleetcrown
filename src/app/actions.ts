"use server";

import { approveAction, rejectAction } from "@/db/queries/actions";
import { dismissAlert } from "@/db/queries/alerts";
import { fulfillCommitment } from "@/db/queries/today";
import { cancelSubscription } from "@/db/queries/money";
import { revalidatePath } from "next/cache";

export async function handleApprove(id: string) {
  await approveAction(id);
  revalidatePath("/today");
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
