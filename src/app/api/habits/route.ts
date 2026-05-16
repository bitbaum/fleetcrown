import { NextRequest, NextResponse } from "next/server";
import { createHabit, getTodayHabits, CreateHabitBody } from "@/db/queries/habits";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const habits = await getTodayHabits(userId);
  return NextResponse.json({ habits });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataOrResp = await readJsonBody(req, CreateHabitBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const habit = await createHabit(dataOrResp.title, dataOrResp.frequency, userId);
  return NextResponse.json({ ok: true, habit }, { status: 201 });
}
