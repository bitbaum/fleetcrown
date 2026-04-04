"use server";

import { approveAction, rejectAction } from "@/db/queries/actions";
import { revalidatePath } from "next/cache";

export async function handleApprove(id: string) {
  await approveAction(id);
  revalidatePath("/today");
}

export async function handleReject(id: string) {
  await rejectAction(id);
  revalidatePath("/today");
}
