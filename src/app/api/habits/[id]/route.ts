import { NextRequest, NextResponse } from "next/server";
import { toggleHabitCompletion, deleteHabit, updateHabit } from "@/db/queries/habits";
import { isValidUuid } from "@/lib/utils";
import { HABIT_FREQUENCY } from "@/lib/constants/statuses";

const VALID_FREQUENCIES = Object.values(HABIT_FREQUENCY);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json() as { done?: boolean; title?: string; frequency?: string };

  // Toggle completion
  if (typeof body.done === "boolean") {
    await toggleHabitCompletion(id, body.done);
    return NextResponse.json({ ok: true });
  }

  // Edit title / frequency
  const title = body.title?.trim();
  const frequency = body.frequency;

  if (!title && !frequency) {
    return NextResponse.json({ error: "done, title, or frequency is required" }, { status: 400 });
  }
  if (frequency && !VALID_FREQUENCIES.includes(frequency as typeof VALID_FREQUENCIES[number])) {
    return NextResponse.json({ error: "invalid frequency" }, { status: 400 });
  }
  if (title !== undefined && !title) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }

  await updateHabit(id, { title, frequency });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteHabit(id);
  return NextResponse.json({ ok: true });
}
