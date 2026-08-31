import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { linkHabitToGoal, unlinkHabitFromGoal, getGoalsForHabit } from "@/db/queries/habit-goals";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

const LinkBody = z.object({ goalId: z.string().uuid("Invalid goalId") });
const UnlinkBody = z.object({ goalId: z.string().uuid("Invalid goalId") });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const linked = await getGoalsForHabit(userId, idOrResp);
  return NextResponse.json(linked);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, LinkBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await linkHabitToGoal(userId, idOrResp, dataOrResp.goalId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;

  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, UnlinkBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  await unlinkHabitFromGoal(userId, idOrResp, dataOrResp.goalId);
  return NextResponse.json({ ok: true });
}
