import { NextRequest, NextResponse } from "next/server";
import { retryFailedCommand } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";

// Re-enqueues a failed command verbatim so the local runtime picks it up again.
// POST /api/control/commands/:id/retry
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid command id" }, { status: 400 });
  }

  const commandId = await retryFailedCommand(userId, id);
  if (!commandId)
    return NextResponse.json({ error: "Command not found or not retryable" }, { status: 404 });
  return NextResponse.json({ ok: true, queued: true, commandId });
}
