import { NextRequest, NextResponse } from "next/server";
import { toggleHabitCompletion, deleteHabit } from "@/db/queries/habits";
import { isValidUuid } from "@/lib/utils";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json() as { done?: boolean };
  if (typeof body.done !== "boolean") {
    return NextResponse.json({ error: "done (boolean) is required" }, { status: 400 });
  }

  await toggleHabitCompletion(id, body.done);
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
