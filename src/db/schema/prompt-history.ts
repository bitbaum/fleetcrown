import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { AdapterId, OrchestrationTaskIntentId } from "@/lib/orchestration";

export const promptHistory = pgTable("prompt_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  projectKey: text("project_key").notNull(),
  projectPath: text("project_path").notNull(),
  adapter: text("adapter").$type<AdapterId>().notNull(),
  intent: text("intent").$type<OrchestrationTaskIntentId>().notNull(),
  customPrompt: text("custom_prompt"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_prompt_history_project_key").on(table.projectKey),
  index("idx_prompt_history_dispatched_at").on(table.dispatchedAt),
]);

export type PromptHistoryRow = typeof promptHistory.$inferSelect;
export type NewPromptHistoryRow = typeof promptHistory.$inferInsert;
