import { NextResponse } from "next/server";
import { enqueuePendingCommand } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";

export async function POST() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commandId = await enqueuePendingCommand({
    userId,
    type: "repair_helper",
    payload: {},
  });
  return NextResponse.json({ ok: true, queued: true, commandId });
}
