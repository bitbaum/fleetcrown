import { NextRequest, NextResponse } from "next/server";
import { patchGoal, deleteGoal, PatchGoalBody } from "@/db/queries/goals";
import { getCurrentUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const updated = await patchGoal(userId, idOrResp, dataOrResp);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, goal: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const deleted = await deleteGoal(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted });
}
