import { GOAL_STATUS, type GoalStatus } from "@/lib/constants/statuses";
import { db } from "@/db";
import { goals, entities, type Milestone } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const MilestoneSchema = z.object({
  title: z.string(),
  done: z.boolean(),
  date: z.string().optional(),
});

export const CreateGoalBody = z.object({
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().optional(),
  targetDate: z.string().optional(),
  parentGoalId: z.string().uuid("Invalid parentGoalId").optional(),
  entityId: z.string().uuid("Invalid entityId").optional(),
});
export type CreateGoalInput = z.infer<typeof CreateGoalBody>;

const GOAL_STATUSES = Object.values(GOAL_STATUS) as [GoalStatus, ...GoalStatus[]];

export const PatchGoalBody = z
  .object({
    title: z.string().trim().min(1, "title cannot be empty").optional(),
    description: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    status: z.enum(GOAL_STATUSES).optional(),
    milestones: z.array(MilestoneSchema).optional(),
    targetDate: z.string().nullable().optional(),
    entityId: z.string().refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v), { message: "Invalid entityId" }).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type GoalWithChildren = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  progress: number | null;
  targetDate: Date | null;
  completedAt: Date | null;
  milestones: Milestone[] | null;
  entityId: string | null;
  entityName: string | null;
  children: GoalWithChildren[];
};

export async function listActiveGoals(userId: string) {
  return db
    .select({ id: goals.id, title: goals.title, status: goals.status, entityId: goals.entityId })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, GOAL_STATUS.ACTIVE)))
    .orderBy(goals.title);
}

export async function createGoal(userId: string, data: CreateGoalInput) {
  const [created] = await db
    .insert(goals)
    .values({
      userId,
      title: data.title,
      description: data.description || null,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      parentGoalId: data.parentGoalId || null,
      entityId: data.entityId || null,
      status: GOAL_STATUS.ACTIVE,
      progress: 0,
    })
    .returning();
  return created;
}

export async function patchGoal(userId: string, id: string, data: z.infer<typeof PatchGoalBody>) {
  const patch: Partial<typeof goals.$inferInsert> = { updatedAt: new Date() };
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description;
  if (data.progress !== undefined) patch.progress = data.progress;
  if (data.status !== undefined) patch.status = data.status;
  if (data.milestones !== undefined) patch.milestones = data.milestones;
  if (data.targetDate !== undefined) patch.targetDate = data.targetDate ? new Date(data.targetDate) : null;
  if (data.entityId !== undefined) patch.entityId = data.entityId || null;
  if (patch.status === GOAL_STATUS.COMPLETED) patch.completedAt = new Date();
  else if (patch.status === GOAL_STATUS.ACTIVE) patch.completedAt = null;
  const [updated] = await db
    .update(goals)
    .set(patch)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteGoal(userId: string, id: string): Promise<number> {
  const [owned] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!owned) return 0;
  const allGoals = await db.select({ id: goals.id, parentGoalId: goals.parentGoalId }).from(goals).where(eq(goals.userId, userId));
  function collectSubtree(rootId: string): string[] {
    const ids = [rootId];
    for (const g of allGoals) {
      if (g.parentGoalId === rootId) ids.push(...collectSubtree(g.id));
    }
    return ids;
  }
  const idsToDelete = collectSubtree(id);
  await db.delete(goals).where(inArray(goals.id, idsToDelete));
  return idsToDelete.length;
}

export async function getGoals(userId: string): Promise<GoalWithChildren[]> {
  const allGoals = await db
    .select({
      id: goals.id,
      title: goals.title,
      description: goals.description,
      status: goals.status,
      progress: goals.progress,
      targetDate: goals.targetDate,
      completedAt: goals.completedAt,
      milestones: goals.milestones,
      parentGoalId: goals.parentGoalId,
      entityId: goals.entityId,
      entityName: entities.name,
    })
    .from(goals)
    .leftJoin(entities, eq(goals.entityId, entities.id))
    .where(eq(goals.userId, userId))
    .orderBy(goals.createdAt);

  const childrenMap = new Map<string | null, typeof allGoals>();

  for (const goal of allGoals) {
    const parentKey = goal.parentGoalId ?? null;
    const existing = childrenMap.get(parentKey) ?? [];
    existing.push(goal);
    childrenMap.set(parentKey, existing);
  }

  function buildTree(parentId: string | null): GoalWithChildren[] {
    const children = childrenMap.get(parentId) ?? [];
    return children.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      status: g.status,
      progress: g.progress,
      targetDate: g.targetDate,
      completedAt: g.completedAt,
      milestones: g.milestones as GoalWithChildren["milestones"],
      entityId: g.entityId,
      entityName: g.entityName ?? null,
      children: buildTree(g.id),
    }));
  }

  return buildTree(null);
}

export async function getGoalStats(userId: string) {
  const [result] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${goals.status} = ${GOAL_STATUS.ACTIVE})`,
      completed: sql<number>`count(*) filter (where ${goals.status} = ${GOAL_STATUS.COMPLETED})`,
      avgProgress: sql<number>`coalesce(avg(${goals.progress}) filter (where ${goals.status} = ${GOAL_STATUS.ACTIVE}), 0)`,
    })
    .from(goals)
    .where(eq(goals.userId, userId));

  return {
    total: Number(result.total),
    active: Number(result.active),
    completed: Number(result.completed),
    avgProgress: Math.round(Number(result.avgProgress)),
  };
}
