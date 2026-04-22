"use server";

import { approveAction, rejectAction } from "@/db/queries/actions";
import { dismissAlert } from "@/db/queries/alerts";
import { fulfillCommitment } from "@/db/queries/today";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
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
  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(
      and(eq(subscriptions.id, id), eq(subscriptions.userId, DEFAULT_USER_ID)),
    );
  revalidatePath("/money");
}
