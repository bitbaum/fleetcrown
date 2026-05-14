import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/auth";
import { claimNextPendingCommand } from "@/db/queries/pending-commands";

async function resolveUserId(req: NextRequest): Promise<string | null> {
  // Machine-to-machine: daemon bearer token → look up default user in DB.
  const token = process.env.COCKPIT_DAEMON_TOKEN;
  if (token && (req.headers.get("authorization") ?? "") === `Bearer ${token}`) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.isDefault, true)).limit(1);
    return user?.id ?? null;
  }

  // Browser session: require an authenticated user (no DEFAULT_USER_ID fallback here).
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
