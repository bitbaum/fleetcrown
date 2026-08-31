import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { GOAL_STATUS, type GoalStatus } from "@/lib/constants/statuses";

/** Shape of one entry in the JSONB `milestones` column on goals.
 *  Defined first so the schema's `.$type<>` and any consumers
 *  share the same source of truth. */
export type Milestone = { title: string; done: boolean; date?: string };

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    parentGoalId: uuid("parent_goal_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<GoalStatus>().default(GOAL_STATUS.ACTIVE),
    progress: integer("progress").default(0),
    targetDate: timestamp("target_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    milestones: jsonb("milestones").$type<Milestone[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_goals_user_id").on(table.userId),
    index("idx_goals_user_status").on(table.userId, table.status),
    index("idx_goals_status").on(table.status),
    index("idx_goals_parent").on(table.parentGoalId),
    index("idx_goals_entity_id").on(table.entityId),
  ],
);

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
