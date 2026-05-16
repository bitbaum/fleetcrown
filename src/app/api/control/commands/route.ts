import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { isDaemonRequest, getDaemonUserId } from "@/lib/daemon-auth";

async function resolveUserId(req: NextRequest): Promise<string | null> {
  if (isDaemonRequest(req)) return getDaemonUserId();
  const session = await auth();
  return session?.user?.id ?? null;
}

// Daemon polls this to claim the next pending command.
// Auth: Authorization: Bearer <COCKPIT_DAEMON_TOKEN>  OR  authenticated browser session.
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const command = await claimNextPendingCommand(userId);
  return NextResponse.json({ command: command ?? null });
}
