import { NextRequest, NextResponse } from "next/server";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { getCurrentUserId } from "@/lib/session";

function isDaemonAuthed(req: NextRequest): boolean {
  const token = process.env.COCKPIT_DAEMON_TOKEN;
  if (!token) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${token}`;
}

// Daemon polls this to claim the next pending command.
// Auth: Authorization: Bearer <COCKPIT_DAEMON_TOKEN>  OR  session cookie (local dev).
export async function GET(req: NextRequest) {
  let userId: string;

  if (isDaemonAuthed(req)) {
    const configured = process.env.COCKPIT_DAEMON_USER_ID;
    if (!configured) {
      return NextResponse.json({ error: "COCKPIT_DAEMON_USER_ID not set" }, { status: 500 });
    }
    userId = configured;
  } else {
    try {
      userId = await getCurrentUserId();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const command = await claimNextPendingCommand(userId);
  return NextResponse.json({ command: command ?? null });
}
