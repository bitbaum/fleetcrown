import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { DEFAULT_USER_ID } from "@/lib/constants";
import { readIdParam, readJsonBody, z } from "@/lib/api/route-helpers";
import { GOAL_STATUS, type GoalStatus } from "@/lib/constants/statuses";
import { MilestoneSchema } from "@/db/queries/goals";

const STATUSES = Object.values(GOAL_STATUS) as [GoalStatus, ...GoalStatus[]];

const PatchGoalBody = z
  .object({
    title: z.string().trim().min(1, "title cannot be empty").optional(),
    description: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    status: z.enum(STATUSES).optional(),
    milestones: z.array(MilestoneSchema).optional(),
    targetDate: z.string().nullable().optional(),
    // Empty string is allowed (unlink); non-empty must be a UUID.
    entityId: z.string().refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v), { message: "Invalid entityId" }).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const dataOrResp = await readJsonBody(req, PatchGoalBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const patch: Partial<typeof goals.$inferInsert> = { updatedAt: new Date() };
  if (dataOrResp.title !== undefined) patch.title = dataOrResp.title;
  if (dataOrResp.description !== undefined) patch.description = dataOrResp.description;
  if (dataOrResp.progress !== undefined) patch.progress = dataOrResp.progress;
  if (dataOrResp.status !== undefined) patch.status = dataOrResp.status;
  if (dataOrResp.milestones !== undefined) patch.milestones = dataOrResp.milestones;
  if (dataOrResp.targetDate !== undefined) patch.targetDate = dataOrResp.targetDate ? new Date(dataOrResp.targetDate) : null;
  if (dataOrResp.entityId !== undefined) patch.entityId = dataOrResp.entityId || null;

  // If marking completed, record completedAt; if reactivating, clear it
  if (patch.status === GOAL_STATUS.COMPLETED) patch.completedAt = new Date();
  else if (patch.status === GOAL_STATUS.ACTIVE) patch.completedAt = null;

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
