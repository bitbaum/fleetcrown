import { NextRequest, NextResponse } from "next/server";
import { toggleHabitCompletion, deleteHabit, updateHabit } from "@/db/queries/habits";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { HABIT_FREQUENCY } from "@/lib/constants/statuses";

const FREQUENCIES = Object.values(HABIT_FREQUENCY) as [string, ...string[]];

const PatchHabitBody = z
  .object({
    done: z.boolean().optional(),
    title: z.string().trim().min(1, "title cannot be empty").optional(),
    frequency: z.enum(FREQUENCIES).optional(),
  })
  .refine((v) => v.done !== undefined || v.title !== undefined || v.frequency !== undefined, {
    message: "done, title, or frequency is required",
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchHabitBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  // Toggle completion takes precedence: it's a separate operation from edit.
  if (dataOrResp.done !== undefined) {
    await toggleHabitCompletion(id, dataOrResp.done);
    return NextResponse.json({ ok: true });
  }

  await updateHabit(id, { title: dataOrResp.title, frequency: dataOrResp.frequency });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  await deleteHabit(idOrResp);
  return NextResponse.json({ ok: true });
}
