import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { isValidUuid } from "@/lib/utils";

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
