import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { AdapterId, OrchestrationEventType, OrchestrationTaskIntentId } from "@/lib/orchestration";

export const orchestrationEvents = pgTable("orchestration_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectKey: text("project_key").notNull(),
  eventType: text("event_type").$type<OrchestrationEventType>().notNull(),
  source: text("source").notNull(),
  adapter: text("adapter").$type<AdapterId>(),
  intent: text("intent").$type<OrchestrationTaskIntentId>(),
  detail: text("detail"),
  happenedAt: timestamp("happened_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_orch_events_user_project_time").on(table.userId, table.projectKey, table.happenedAt),
  index("idx_orch_events_user_project_type_time").on(table.userId, table.projectKey, table.eventType, table.happenedAt),
]);

export type OrchestrationEvent = typeof orchestrationEvents.$inferSelect;
export type NewOrchestrationEvent = typeof orchestrationEvents.$inferInsert;
