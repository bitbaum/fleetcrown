import { NextRequest, NextResponse } from "next/server";
import { patchGoal, deleteGoal, PatchGoalBody } from "@/db/queries/goals";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const updated = await patchGoal(userId, idOrResp, dataOrResp);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, goal: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update goal";
    if (msg === "Invalid entityId") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const deleted = await deleteGoal(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted });
}
