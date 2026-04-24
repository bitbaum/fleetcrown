import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { habits, habitCompletions } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { HABIT_FREQUENCY } from "@/lib/constants/statuses";

/** Returns today's date as YYYY-MM-DD in local time */
function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whether a habit should appear today given its frequency */
function isDueToday(frequency: string): boolean {
  const dow = new Date().getDay(); // 0=Sun, 6=Sat
  if (frequency === HABIT_FREQUENCY.WEEKDAYS) return dow >= 1 && dow <= 5;
  if (frequency === HABIT_FREQUENCY.WEEKLY)   return dow === 1; // Mondays
  return true; // daily
}

export type HabitWithStatus = {
  id: string;
  title: string;
  frequency: string;
  sortOrder: number;
  doneToday: boolean;
  /** 7-day streak count */
  streak: number;
};

export async function getTodayHabits(): Promise<HabitWithStatus[]> {
  const today = todayDate();

  const activeHabits = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, DEFAULT_USER_ID), eq(habits.active, true)))
    .orderBy(habits.sortOrder, habits.createdAt);

  if (activeHabits.length === 0) return [];

  const dueHabits = activeHabits.filter((h) => isDueToday(h.frequency));
  if (dueHabits.length === 0) return [];

  const habitIds = dueHabits.map((h) => h.id);

  // Completions for today and the last 6 days (for streak calculation)
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

  const completions = await db
    .select()
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.userId, DEFAULT_USER_ID),
        inArray(habitCompletions.habitId, habitIds),
        sql`${habitCompletions.completedDate} >= ${sinceStr}`,
      ),
    );

  const byHabit = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!byHabit.has(c.habitId)) byHabit.set(c.habitId, new Set());
    byHabit.get(c.habitId)!.add(c.completedDate);
  }

  return dueHabits.map((h) => {
    const dates = byHabit.get(h.id) ?? new Set<string>();
    const doneToday = dates.has(today);
    // Simple streak: consecutive days done (including today)
    let streak = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (dates.has(ds)) streak++;
      else break;
    }
    return { id: h.id, title: h.title, frequency: h.frequency, sortOrder: h.sortOrder, doneToday, streak };
  });
}

export async function toggleHabitCompletion(habitId: string, done: boolean): Promise<void> {
  const today = todayDate();
  if (done) {
    await db
      .insert(habitCompletions)
      .values({ userId: DEFAULT_USER_ID, habitId, completedDate: today })
      .onConflictDoNothing();
  } else {
    await db
      .delete(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, DEFAULT_USER_ID),
          eq(habitCompletions.habitId, habitId),
          eq(habitCompletions.completedDate, today),
        ),
      );
  }
}

export async function createHabit(title: string, frequency: string): Promise<{ id: string; title: string }> {
  const [maxOrder] = await db
    .select({ max: sql<number>`coalesce(max(${habits.sortOrder}), -1)` })
    .from(habits)
    .where(eq(habits.userId, DEFAULT_USER_ID));

  const [habit] = await db
    .insert(habits)
    .values({
      userId: DEFAULT_USER_ID,
      title: title.trim(),
      frequency,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    })
    .returning({ id: habits.id, title: habits.title });
  return habit;
}

export async function deleteHabit(id: string): Promise<void> {
  await db
    .delete(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, DEFAULT_USER_ID)));
}
