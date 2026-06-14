import { NextRequest, NextResponse } from "next/server";
import { markCommandExecuted } from "@/db/queries/pending-commands";
import { getApiUserId } from "@/lib/session";

// Runner calls this to mark a command as executed.
// PATCH /api/control/commands/:id  body: { ok: boolean, error?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ok = typeof body.ok === "boolean" ? body.ok : true;
  const error = typeof body.error === "string" ? body.error : undefined;
  const text = typeof body.text === "string" ? body.text : undefined;

  const updated = await markCommandExecuted(id, userId, { ok, text, error });
  if (!updated) return NextResponse.json({ error: "Command not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
