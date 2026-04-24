import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { EVENT_STATUS } from "@/lib/constants/statuses";
import { isValidUuid } from "@/lib/utils";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

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
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, DEFAULT_USER_ID)));

  return NextResponse.json({ ok: true });
}
