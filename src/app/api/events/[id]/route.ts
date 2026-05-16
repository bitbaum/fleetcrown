import { NextRequest, NextResponse } from "next/server";
import { patchEvent, deleteEvent, PatchEventBody } from "@/db/queries/events";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchEventBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const updated = await patchEvent(userId, idOrResp, dataOrResp);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  await deleteEvent(userId, idOrResp);
  return NextResponse.json({ ok: true });
}
