import { NextRequest, NextResponse } from "next/server";
import { createHabit, getTodayHabits } from "@/db/queries/habits";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const FREQUENCIES = Object.values(HABIT_FREQUENCY) as [HabitFrequency, ...HabitFrequency[]];

const CreateHabitBody = z.object({
  title: z.string().trim().min(1, "title is required"),
  frequency: z.enum(FREQUENCIES).default(HABIT_FREQUENCY.DAILY),
});

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
