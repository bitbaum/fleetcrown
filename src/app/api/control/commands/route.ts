import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";
import { DAEMON_LONG_POLL_MS } from "@/lib/constants/daemon";

// Daemon polls this to claim the next pending command.
// Auth: Bearer (env token or ck_* agent token) OR browser session.
// ?wait=N (seconds, max DAEMON_LONG_POLL_SECONDS): long-poll — holds until a
// command arrives or wait expires. Cap lives in @/lib/constants/daemon so the
// desktop poller's request shape and this server-side ceiling can't drift.
export async function GET(request: NextRequest) {
  // Resolve user IDs once (supports both browser session and Bearer token).
  let userIds: string[];
  const session = await auth();
  if (session?.user?.id) {
    userIds = [session.user.id];
  } else {
    // Bearer-authenticated daemons are per-user. A token must never claim
    // another account's commands, even if projects share the same host.
    const userId = await getApiUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userIds = [userId];
  }

  // Long-poll: hold the request until a command arrives or the wait expires.
  const waitMs = Math.min(
    parseInt(request.nextUrl.searchParams.get("wait") ?? "0", 10) * 1000,
    DAEMON_LONG_POLL_MS,
  );
  if (waitMs > 0) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline && !request.signal.aborted) {
      const command = await claimNextPendingCommand(userIds);
      if (command) return NextResponse.json({ command });
      await new Promise<void>((res) => setTimeout(res, 100));
    }
    return NextResponse.json({ command: null });
  }

  const command = await claimNextPendingCommand(userIds);
  return NextResponse.json({ command: command ?? null });
}
