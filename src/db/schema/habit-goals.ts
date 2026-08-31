import { pgTable, uuid, timestamp, index, unique } from "drizzle-orm/pg-core";
import { habits } from "./habits";
import { goals } from "./goals";
import { users } from "./users";

export const habitGoals = pgTable(
  "habit_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_habit_goals_habit_id").on(table.habitId),
    index("idx_habit_goals_goal_id").on(table.goalId),
    unique("uq_habit_goal").on(table.habitId, table.goalId),
  ],
);

export type HabitGoal = typeof habitGoals.$inferSelect;
