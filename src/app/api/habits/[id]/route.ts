import { NextRequest, NextResponse } from "next/server";
import { toggleHabitCompletion, deleteHabit, updateHabit, PatchHabitBody } from "@/db/queries/habits";
import { getCurrentUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchHabitBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const userId = await getCurrentUserId();

  if (dataOrResp.done !== undefined) {
    await toggleHabitCompletion(id, dataOrResp.done, userId);
    return NextResponse.json({ ok: true });
  }

  await updateHabit(id, { title: dataOrResp.title, frequency: dataOrResp.frequency, active: dataOrResp.active }, userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const userId = await getCurrentUserId();
  await deleteHabit(idOrResp, userId);
  return NextResponse.json({ ok: true });
}
