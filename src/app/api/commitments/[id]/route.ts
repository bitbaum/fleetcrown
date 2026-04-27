import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { commitments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { PatchCommitmentBody } from "@/db/queries/today";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchCommitmentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const patch: Partial<typeof commitments.$inferInsert> = { updatedAt: new Date() };
  if (dataOrResp.description !== undefined) patch.description = dataOrResp.description;
  if (dataOrResp.dueDate !== undefined) patch.dueDate = dataOrResp.dueDate ? new Date(dataOrResp.dueDate) : null;
  if (dataOrResp.financialImpact !== undefined) patch.financialImpact = dataOrResp.financialImpact?.trim() || null;

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
