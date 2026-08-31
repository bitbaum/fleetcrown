import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { deleteCapture } from "@/db/queries/captures";
import { readIdParam } from "@/lib/api/route-helpers";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const idOrResp = await readIdParam(ctx.params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const deleted = await deleteCapture(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
