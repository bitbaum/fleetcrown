import { GOAL_STATUS, type GoalStatus } from "@/lib/constants/statuses";
import { db } from "@/db";
import { goals, entities, type Milestone } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

export const MilestoneSchema = z.object({
  title: z.string(),
  done: z.boolean(),
  date: z.string().optional(),
});

export const CreateGoalBody = z.object({
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().optional(),
  targetDate: z.string().optional(),
  parentGoalId: z.string().uuid("Invalid parentGoalId").optional(),
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
