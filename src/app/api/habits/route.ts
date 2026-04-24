import { NextRequest, NextResponse } from "next/server";
import { createHabit, getTodayHabits } from "@/db/queries/habits";
import { HABIT_FREQUENCY } from "@/lib/constants/statuses";

const VALID_FREQUENCIES = Object.values(HABIT_FREQUENCY);

export async function GET() {
  const habits = await getTodayHabits();
  return NextResponse.json({ habits });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { title?: string; frequency?: string };
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const frequency = VALID_FREQUENCIES.includes(body.frequency as typeof VALID_FREQUENCIES[number])
    ? body.frequency!
    : HABIT_FREQUENCY.DAILY;
  const habit = await createHabit(title, frequency);
  return NextResponse.json({ ok: true, habit }, { status: 201 });
}
