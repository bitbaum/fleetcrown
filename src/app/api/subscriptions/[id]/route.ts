import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { isValidUuid } from "@/lib/utils";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [deleted] = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, DEFAULT_USER_ID)))
    .returning({ id: subscriptions.id });

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
