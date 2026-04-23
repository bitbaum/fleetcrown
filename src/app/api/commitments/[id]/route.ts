import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { commitments } from "@/db/schema";
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
    .delete(commitments)
    .where(and(eq(commitments.id, id), eq(commitments.userId, DEFAULT_USER_ID)));

  return NextResponse.json({ ok: true });
}
