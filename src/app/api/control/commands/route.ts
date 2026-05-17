import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { getAllDistinctUserIds } from "@/db/queries/user-projects";
import { getApiUserId } from "@/lib/session";

// Daemon polls this to claim the next pending command.
// Auth: Bearer (env token or ck_* agent token) OR browser session.
export async function GET() {
  const session = await auth();
  if (session?.user?.id) {
    const command = await claimNextPendingCommand([session.user.id]);
    return NextResponse.json({ command: command ?? null });
  }

  // Bearer-authenticated daemon: services all locally-registered users.
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userIds = await getAllDistinctUserIds().catch(() => [userId]);
  if (userIds.length === 0) userIds.push(userId);
  const command = await claimNextPendingCommand(userIds);
  return NextResponse.json({ command: command ?? null });
}
