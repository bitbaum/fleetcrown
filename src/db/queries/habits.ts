import { DEFAULT_USER_ID, HABIT_HISTORY_DAYS } from "@/lib/constants";
import { db } from "@/db";
import { habits, habitCompletions } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { toLocalDateStr } from "@/lib/dates";

const todayDate = () => toLocalDateStr(new Date());

/** Whether a habit should appear today given its frequency */
function isDueToday(frequency: HabitFrequency): boolean {
  const dow = new Date().getDay(); // 0=Sun, 6=Sat
  if (frequency === HABIT_FREQUENCY.WEEKDAYS) return dow >= 1 && dow <= 5;
  if (frequency === HABIT_FREQUENCY.WEEKLY)   return dow === 1; // Mondays
  return true; // daily
}

export type HabitWithStatus = {
  id: string;
  title: string;
  frequency: HabitFrequency;
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
  const sinceStr = toLocalDateStr(since);

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
      if (dates.has(toLocalDateStr(d))) streak++;
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

export async function createHabit(title: string, frequency: HabitFrequency): Promise<{ id: string; title: string }> {
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

export type HabitWithHistory = {
  id: string;
  title: string;
  frequency: HabitFrequency;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  /** Set of YYYY-MM-DD strings with completions in the window */
  completedDates: Set<string>;
  /** Total completions in the window */
  completionsInWindow: number;
  /** Current consecutive streak (days) */
  streak: number;
};

/** Get all habits with their last `days` days of completion data */
export async function getAllHabitsWithHistory(days = HABIT_HISTORY_DAYS): Promise<HabitWithHistory[]> {
  const allHabits = await db
    .select()
    .from(habits)
    .where(eq(habits.userId, DEFAULT_USER_ID))
    .orderBy(habits.active, habits.sortOrder, habits.createdAt);

  if (allHabits.length === 0) return [];

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceStr = toLocalDateStr(since);

  const completions = await db
    .select()
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.userId, DEFAULT_USER_ID),
        inArray(habitCompletions.habitId, allHabits.map((h) => h.id)),
        sql`${habitCompletions.completedDate} >= ${sinceStr}`,
      ),
    );

  const byHabit = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!byHabit.has(c.habitId)) byHabit.set(c.habitId, new Set());
    byHabit.get(c.habitId)!.add(c.completedDate);
  }

  return allHabits.map((h) => {
    const dates = byHabit.get(h.id) ?? new Set<string>();
    // Streak: consecutive days ending today (or yesterday if not yet done today)
    let streak = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (dates.has(toLocalDateStr(d))) streak++;
      else break;
    }
    return {
      id: h.id,
      title: h.title,
      frequency: h.frequency,
      sortOrder: h.sortOrder,
      active: h.active,
      createdAt: h.createdAt,
      completedDates: dates,
      completionsInWindow: dates.size,
      streak,
    };
  });
}

export async function updateHabit(
  id: string,
  fields: { title?: string; frequency?: string },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (fields.title)     set.title     = fields.title.trim();
  if (fields.frequency) set.frequency = fields.frequency;
  if (Object.keys(set).length === 0) return;
  await db
    .update(habits)
    .set(set)
    .where(and(eq(habits.id, id), eq(habits.userId, DEFAULT_USER_ID)));
}
