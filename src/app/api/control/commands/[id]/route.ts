import { NextRequest, NextResponse } from "next/server";
import { markCommandExecuted } from "@/db/queries/pending-commands";
import { getCurrentUserId } from "@/lib/session";

function isDaemonAuthed(req: NextRequest): boolean {
  const token = process.env.COCKPIT_DAEMON_TOKEN;
  if (!token) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${token}`;
}

// Daemon calls this to mark a command as executed.
// PATCH /api/control/commands/:id  body: { ok: boolean, error?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isDaemonAuthed(req)) {
    try {
      await getCurrentUserId();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const ok = typeof body.ok === "boolean" ? body.ok : true;
  const error = typeof body.error === "string" ? body.error : undefined;

  await markCommandExecuted(id, { ok, error });
  return NextResponse.json({ ok: true });
}
