import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { linkHabitToGoal, unlinkHabitFromGoal, getGoalsForHabit } from "@/db/queries/habit-goals";

const LinkBody = z.object({ goalId: z.string().uuid("Invalid goalId") });
const UnlinkBody = z.object({ goalId: z.string().uuid("Invalid goalId") });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const linked = await getGoalsForHabit(userId, idOrResp);
  return NextResponse.json(linked);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, LinkBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await linkHabitToGoal(userId, idOrResp, dataOrResp.goalId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, UnlinkBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await unlinkHabitFromGoal(userId, idOrResp, dataOrResp.goalId);
  return NextResponse.json({ ok: true });
}
