import { DEFAULT_USER_ID } from "@/lib/constants";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import { db } from "@/db";
import { goals, entities } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type GoalWithChildren = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  progress: number | null;
  targetDate: Date | null;
  completedAt: Date | null;
  milestones: Array<{ title: string; done: boolean; date?: string }> | null;
  entityId: string | null;
  entityName: string | null;
  children: GoalWithChildren[];
};

export async function getGoals(): Promise<GoalWithChildren[]> {
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
    .where(eq(goals.userId, DEFAULT_USER_ID))
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

export async function getGoalStats() {
  const [result] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${goals.status} = ${GOAL_STATUS.ACTIVE})`,
      completed: sql<number>`count(*) filter (where ${goals.status} = ${GOAL_STATUS.COMPLETED})`,
      avgProgress: sql<number>`coalesce(avg(${goals.progress}) filter (where ${goals.status} = ${GOAL_STATUS.ACTIVE}), 0)`,
    })
    .from(goals)
    .where(eq(goals.userId, DEFAULT_USER_ID));

  return {
    total: Number(result.total),
    active: Number(result.active),
    completed: Number(result.completed),
    avgProgress: Math.round(Number(result.avgProgress)),
  };
}
