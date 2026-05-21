import { NextRequest, NextResponse } from "next/server";
import { createHabit, getTodayHabits, CreateHabitBody } from "@/db/queries/habits";
import { readJsonBody } from "@/lib/api/route-helpers";
import { requirePrivateApiAccess } from "@/lib/private-zone-api";

export async function GET() {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const habits = await getTodayHabits(userId);
  return NextResponse.json({ habits });
}

export async function POST(req: NextRequest) {
  const access = await requirePrivateApiAccess();
  if (access instanceof NextResponse) return access;
  const { userId } = access;
  const dataOrResp = await readJsonBody(req, CreateHabitBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const habit = await createHabit(dataOrResp.title, dataOrResp.frequency, userId);
  return NextResponse.json({ ok: true, habit }, { status: 201 });
}
