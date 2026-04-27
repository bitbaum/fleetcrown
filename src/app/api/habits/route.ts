import { NextRequest, NextResponse } from "next/server";
import { createHabit, getTodayHabits, CreateHabitBody } from "@/db/queries/habits";
import { readJsonBody } from "@/lib/api/route-helpers";

export async function GET() {
  const habits = await getTodayHabits();
  return NextResponse.json({ habits });
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, CreateHabitBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const habit = await createHabit(dataOrResp.title, dataOrResp.frequency);
  return NextResponse.json({ ok: true, habit }, { status: 201 });
}
