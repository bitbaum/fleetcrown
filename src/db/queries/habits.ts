import { HABIT_HISTORY_DAYS } from "@/lib/constants";
import { db } from "@/db";
import { habits, habitCompletions } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";
import { toLocalDateStr } from "@/lib/dates";
import { z } from "zod";

const HABIT_FREQUENCIES = Object.values(HABIT_FREQUENCY) as [HabitFrequency, ...HabitFrequency[]];

export const CreateHabitBody = z.object({
  title: z.string().trim().min(1, "title is required"),
  frequency: z.enum(HABIT_FREQUENCIES).default(HABIT_FREQUENCY.DAILY),
});

export const PatchHabitBody = z
  .object({
    done: z.boolean().optional(),
    title: z.string().trim().min(1, "title cannot be empty").optional(),
    frequency: z.enum(HABIT_FREQUENCIES).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.done !== undefined || v.title !== undefined || v.frequency !== undefined || v.active !== undefined,
    { message: "done, title, frequency, or active is required" },
  );

const todayDate = () => toLocalDateStr(new Date());

function isDueToday(frequency: HabitFrequency): boolean {
  const dow = new Date().getDay();
  if (frequency === HABIT_FREQUENCY.WEEKDAYS) return dow >= 1 && dow <= 5;
  if (frequency === HABIT_FREQUENCY.WEEKLY)   return dow === 1;
  return true;
}

function computeStreak(dates: Set<string>, maxDays: number): number {
  let streak = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (dates.has(toLocalDateStr(d))) streak++;
    else break;
  }
  return streak;
}

export function scheduledDays(frequency: HabitFrequency, days: number): number {
  let count = 0;
  for (let i = 0; i < days; i++) {
    const dow = new Date(Date.now() - i * 86_400_000).getDay();
    if (frequency === HABIT_FREQUENCY.DAILY) count++;
    else if (frequency === HABIT_FREQUENCY.WEEKDAYS && dow >= 1 && dow <= 5) count++;
    else if (frequency === HABIT_FREQUENCY.WEEKLY && dow === 1) count++;
  }
  return Math.max(1, count);
}

export type HabitWithStatus = {
  id: string;
  title: string;
  frequency: HabitFrequency;
  sortOrder: number;
  doneToday: boolean;
  streak: number;
};

export async function getTodayHabits(userId: string): Promise<HabitWithStatus[]> {
  const today = todayDate();

  const activeHabits = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.active, true)))
    .orderBy(habits.sortOrder, habits.createdAt);

  if (activeHabits.length === 0) return [];

  const dueHabits = activeHabits.filter((h) => isDueToday(h.frequency));
  if (dueHabits.length === 0) return [];

  const habitIds = dueHabits.map((h) => h.id);

  const since = new Date();
  since.setDate(since.getDate() - (HABIT_HISTORY_DAYS - 1));
  const sinceStr = toLocalDateStr(since);

  const completions = await db
    .select()
    .from(habitCompletions)
    .where(
      and(
        eq(habitCompletions.userId, userId),
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
    const streak = computeStreak(dates, HABIT_HISTORY_DAYS);
    return { id: h.id, title: h.title, frequency: h.frequency, sortOrder: h.sortOrder, doneToday, streak };
  });
}

export async function toggleHabitCompletion(habitId: string, done: boolean, userId: string): Promise<void> {
  const today = todayDate();
  if (done) {
    await db
      .insert(habitCompletions)
      .values({ userId, habitId, completedDate: today })
      .onConflictDoNothing();
  } else {
    await db
      .delete(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, userId),
          eq(habitCompletions.habitId, habitId),
          eq(habitCompletions.completedDate, today),
        ),
      );
  }
}

export async function createHabit(title: string, frequency: HabitFrequency, userId: string): Promise<{ id: string; title: string }> {
  const [maxOrder] = await db
    .select({ max: sql<number>`coalesce(max(${habits.sortOrder}), -1)` })
    .from(habits)
    .where(eq(habits.userId, userId));

  const [habit] = await db
    .insert(habits)
    .values({
      userId,
      title: title.trim(),
      frequency,
      sortOrder: (maxOrder?.max ?? -1) + 1,
    })
    .returning({ id: habits.id, title: habits.title });
  return habit;
}

export async function deleteHabit(id: string, userId: string): Promise<void> {
  await db
    .delete(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
}

export type HabitWithHistory = {
  id: string;
  title: string;
  frequency: HabitFrequency;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  completedDates: Set<string>;
  completionsInWindow: number;
  streak: number;
};

export async function getAllHabitsWithHistory(userId: string, days = HABIT_HISTORY_DAYS): Promise<HabitWithHistory[]> {
  const allHabits = await db
    .select()
    .from(habits)
    .where(eq(habits.userId, userId))
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
        eq(habitCompletions.userId, userId),
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
    const streak = computeStreak(dates, days);
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
  fields: { title?: string; frequency?: HabitFrequency; active?: boolean },
  userId: string,
): Promise<void> {
  const set: Partial<typeof habits.$inferInsert> = {};
  if (fields.title)              set.title     = fields.title.trim();
  if (fields.frequency)          set.frequency = fields.frequency;
  if (fields.active !== undefined) set.active  = fields.active;
  if (Object.keys(set).length === 0) return;
  await db
    .update(habits)
    .set(set)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)));
}
