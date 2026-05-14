import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";
import { getCurrentUserId } from "@/lib/session";

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const token = process.env.COCKPIT_DAEMON_TOKEN;
  if (token) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth === `Bearer ${token}`) {
      // Daemon is authed — find the default user (set during /setup).
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.isDefault, true)).limit(1);
      return user?.id ?? null;
    }
  }

  try {
    return await getCurrentUserId();
  } catch {
    return null;
  }
}

// Daemon polls this to claim the next pending command.
// Auth: Authorization: Bearer <COCKPIT_DAEMON_TOKEN>  OR  session cookie (local dev).
export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const command = await claimNextPendingCommand(userId);
  return NextResponse.json({ command: command ?? null });
}
