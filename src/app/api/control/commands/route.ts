import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { getAllDistinctUserIds } from "@/db/queries/user-projects";
import { isDaemonRequest, getDaemonUserId } from "@/lib/daemon-auth";

// Daemon polls this to claim the next pending command.
// Auth: Authorization: Bearer <COCKPIT_DAEMON_TOKEN>  OR  authenticated browser session.
export async function GET(req: NextRequest) {
  if (isDaemonRequest(req)) {
    // Daemon services all local projects regardless of which DB user row owns them.
    // Use all distinct userIds so commands enqueued by an OAuth user (≠ isDefault user)
    // are drained correctly.
    const daemonUserId = await getDaemonUserId();
    if (!daemonUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userIds = await getAllDistinctUserIds().catch(() => [daemonUserId]);
    if (userIds.length === 0) userIds.push(daemonUserId);
    const command = await claimNextPendingCommand(userIds);
    return NextResponse.json({ command: command ?? null });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const command = await claimNextPendingCommand([userId]);
  return NextResponse.json({ command: command ?? null });
}
