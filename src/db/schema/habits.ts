import { pgTable, uuid, text, date, boolean, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { HABIT_FREQUENCY, type HabitFrequency } from "@/lib/constants/statuses";

export const habits = pgTable("habits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  frequency: text("frequency").$type<HabitFrequency>().notNull().default(HABIT_FREQUENCY.DAILY),
  /** Display order (lower = first) */
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_habits_user_id").on(table.userId),
]);

export const habitCompletions = pgTable("habit_completions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
  /** The calendar date this completion applies to (UTC date, no time) */
  completedDate: date("completed_date").notNull(),
}, (table) => [
  index("idx_habit_completions_habit_id").on(table.habitId),
  unique("uq_habit_completion_per_day").on(table.habitId, table.completedDate),
]);

export type Habit = typeof habits.$inferSelect;
export type NewHabit = typeof habits.$inferInsert;
export type HabitCompletion = typeof habitCompletions.$inferSelect;
