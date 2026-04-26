import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { commitments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam } from "@/lib/api/route-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const body = await req.json() as { description?: string; dueDate?: string | null; financialImpact?: string | null };
  if (body.description !== undefined && !body.description.trim()) {
    return NextResponse.json({ error: "Description cannot be empty" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.description !== undefined) patch.description = body.description.trim();
  if ("dueDate" in body) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if ("financialImpact" in body) patch.financialImpact = body.financialImpact?.trim() || null;

  const [updated] = await db
    .update(commitments)
    .set(patch)
    .where(and(eq(commitments.id, id), eq(commitments.userId, DEFAULT_USER_ID)))
    .returning();

  return NextResponse.json({ ok: true, commitment: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  await db
    .delete(commitments)
    .where(and(eq(commitments.id, id), eq(commitments.userId, DEFAULT_USER_ID)));

  return NextResponse.json({ ok: true });
}
