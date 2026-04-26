import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { EVENT_STATUS } from "@/lib/constants/statuses";
import { readIdParam } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const body = await req.json() as { status?: string };
  const validStatuses = Object.values(EVENT_STATUS) as string[];
  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [updated] = await db
    .update(events)
    .set({ status: body.status, updatedAt: new Date() })
    .where(and(eq(events.id, id), eq(events.userId, DEFAULT_USER_ID)))
    .returning();

  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, DEFAULT_USER_ID)));

  return NextResponse.json({ ok: true });
}
