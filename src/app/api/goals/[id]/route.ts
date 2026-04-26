import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { isValidUuid } from "@/lib/utils";
import { readIdParam } from "@/lib/api/route-helpers";
import { GOAL_STATUS } from "@/lib/constants/statuses";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const body = await req.json();
  const allowed = ["progress", "status", "milestones", "title", "description", "targetDate", "entityId"] as const;
  const patch: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  // Coerce targetDate string → Date (or null to clear)
  if ("targetDate" in patch) {
    patch.targetDate = patch.targetDate ? new Date(patch.targetDate as string) : null;
  }
  // Coerce entityId "" → null (unlink)
  if ("entityId" in patch) {
    const eid = patch.entityId as string | null;
    if (eid && !isValidUuid(eid)) return NextResponse.json({ error: "Invalid entityId" }, { status: 400 });
    patch.entityId = eid || null;
  }
  // Reject empty title
  if ("title" in patch && !(patch.title as string)?.trim()) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if ("title" in patch) patch.title = (patch.title as string).trim();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // If marking completed, record completedAt; if reactivating, clear it
  if (patch.status === GOAL_STATUS.COMPLETED) {
    patch.completedAt = new Date();
  } else if (patch.status === GOAL_STATUS.ACTIVE) {
    patch.completedAt = null;
  }

  patch.updatedAt = new Date();

  const [updated] = await db
    .update(goals)
    .set(patch)
    .where(and(eq(goals.id, id), eq(goals.userId, DEFAULT_USER_ID)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, goal: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  // Verify ownership
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, DEFAULT_USER_ID)));
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect entire subtree to delete (no DB cascade on parentGoalId)
  const allGoals = await db
    .select({ id: goals.id, parentGoalId: goals.parentGoalId })
    .from(goals)
    .where(eq(goals.userId, DEFAULT_USER_ID));

  function collectSubtree(rootId: string): string[] {
    const ids = [rootId];
    for (const g of allGoals) {
      if (g.parentGoalId === rootId) ids.push(...collectSubtree(g.id));
    }
    return ids;
  }

  const idsToDelete = collectSubtree(id);
  await db.delete(goals).where(inArray(goals.id, idsToDelete));

  return NextResponse.json({ ok: true, deleted: idsToDelete.length });
}
