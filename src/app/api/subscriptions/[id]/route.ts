import { NextRequest, NextResponse } from "next/server";
import { patchSubscription, deleteSubscription, PatchSubscriptionBody } from "@/db/queries/money";
import { getCurrentUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchSubscriptionBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const updated = await patchSubscription(userId, idOrResp, dataOrResp);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, subscription: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const deleted = await deleteSubscription(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
