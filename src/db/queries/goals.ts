import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

export type GoalWithChildren = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  progress: number | null;
  targetDate: Date | null;
  completedAt: Date | null;
  milestones: Array<{ title: string; done: boolean; date?: string }> | null;
  children: GoalWithChildren[];
};

export async function getGoals(): Promise<GoalWithChildren[]> {
  const allGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, DEFAULT_USER_ID))
    .orderBy(goals.createdAt);

  // Build tree: top-level goals have no parentGoalId
  const byId = new Map(allGoals.map((g) => [g.id, g]));
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
      children: buildTree(g.id),
    }));
  }

  return buildTree(null);
}

export async function getGoalStats() {
  const [result] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${goals.status} = 'active')`,
      completed: sql<number>`count(*) filter (where ${goals.status} = 'completed')`,
      avgProgress: sql<number>`coalesce(avg(${goals.progress}) filter (where ${goals.status} = 'active'), 0)`,
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
