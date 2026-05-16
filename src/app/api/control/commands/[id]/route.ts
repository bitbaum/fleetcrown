import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { markCommandExecuted } from "@/db/queries/pending-commands";
import { isDaemonRequest } from "@/lib/daemon-auth";

// Daemon calls this to mark a command as executed.
// PATCH /api/control/commands/:id  body: { ok: boolean, error?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isDaemonRequest(req)) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const ok = typeof body.ok === "boolean" ? body.ok : true;
  const error = typeof body.error === "string" ? body.error : undefined;
  const text = typeof body.text === "string" ? body.text : undefined;

  await markCommandExecuted(id, { ok, text, error });
  return NextResponse.json({ ok: true });
}
