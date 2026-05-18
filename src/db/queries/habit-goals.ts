import { db } from "@/db";
import { habitGoals, habits, goals } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function linkHabitToGoal(userId: string, habitId: string, goalId: string): Promise<void> {
  await db
    .insert(habitGoals)
    .values({ userId, habitId, goalId })
    .onConflictDoNothing();
}

export async function unlinkHabitFromGoal(userId: string, habitId: string, goalId: string): Promise<void> {
  await db
    .delete(habitGoals)
    .where(
      and(
        eq(habitGoals.userId, userId),
        eq(habitGoals.habitId, habitId),
        eq(habitGoals.goalId, goalId),
      ),
    );
}

export type LinkedGoal = { id: string; title: string };
export type LinkedHabit = { id: string; title: string };

export async function getGoalsForHabit(userId: string, habitId: string): Promise<LinkedGoal[]> {
  const rows = await db
    .select({ id: goals.id, title: goals.title })
    .from(habitGoals)
    .innerJoin(goals, eq(habitGoals.goalId, goals.id))
    .where(and(eq(habitGoals.userId, userId), eq(habitGoals.habitId, habitId)));
  return rows;
}

export async function getHabitsForGoal(userId: string, goalId: string): Promise<LinkedHabit[]> {
  const rows = await db
    .select({ id: habits.id, title: habits.title })
    .from(habitGoals)
    .innerJoin(habits, eq(habitGoals.habitId, habits.id))
    .where(and(eq(habitGoals.userId, userId), eq(habitGoals.goalId, goalId)));
  return rows;
}

/** Returns a map of goalId → linked habits, for the given goal IDs. */
export async function getHabitsByGoalIds(
  userId: string,
  goalIds: string[],
): Promise<Map<string, LinkedHabit[]>> {
  if (goalIds.length === 0) return new Map();
  const rows = await db
    .select({ goalId: habitGoals.goalId, habitId: habits.id, habitTitle: habits.title })
    .from(habitGoals)
    .innerJoin(habits, eq(habitGoals.habitId, habits.id))
    .where(and(eq(habitGoals.userId, userId), inArray(habitGoals.goalId, goalIds)));

  const map = new Map<string, LinkedHabit[]>();
  for (const row of rows) {
    const existing = map.get(row.goalId) ?? [];
    existing.push({ id: row.habitId, title: row.habitTitle });
    map.set(row.goalId, existing);
  }
  return map;
}

/** Returns a map of habitId → linked goal titles, for the given habit IDs. */
export async function getGoalsByHabitIds(
  userId: string,
  habitIds: string[],
): Promise<Map<string, LinkedGoal[]>> {
  if (habitIds.length === 0) return new Map();
  const rows = await db
    .select({ habitId: habitGoals.habitId, goalId: goals.id, goalTitle: goals.title })
    .from(habitGoals)
    .innerJoin(goals, eq(habitGoals.goalId, goals.id))
    .where(and(eq(habitGoals.userId, userId), inArray(habitGoals.habitId, habitIds)));

  const map = new Map<string, LinkedGoal[]>();
  for (const row of rows) {
    const existing = map.get(row.habitId) ?? [];
    existing.push({ id: row.goalId, title: row.goalTitle });
    map.set(row.habitId, existing);
  }
  return map;
}
