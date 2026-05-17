import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { orgs } from "./orgs";
import type { AdapterId, OrchestrationState, OrchestrationTaskIntentId, OrchestrationTaskSummary } from "@/lib/orchestration";

export type OrchestrationRunPayload = {
  projectId?: string | null;
  projectKey: string;
  projectPath: string;
  model?: string;
  resultText?: string;
  raw?: string;
  durationMs?: number;
  error?: string;
};

export const orchestrationRuns = pgTable("orchestration_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
  adapter: text("adapter").$type<AdapterId>().notNull(),
  intent: text("intent").$type<OrchestrationTaskIntentId>().notNull(),
  state: text("state").$type<OrchestrationState>().notNull(),
  projectKey: text("project_key").notNull(),
  projectPath: text("project_path").notNull(),
  summary: jsonb("summary").$type<OrchestrationTaskSummary>(),
  payload: jsonb("payload").$type<OrchestrationRunPayload>(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_orchestration_runs_user_id").on(table.userId),
  index("idx_orchestration_runs_org_id").on(table.orgId),
  index("idx_orchestration_runs_project_id").on(table.projectId),
  index("idx_orchestration_runs_project_path").on(table.projectPath),
  index("idx_orchestration_runs_started_at").on(table.startedAt),
]);

export type OrchestrationRun = typeof orchestrationRuns.$inferSelect;
export type NewOrchestrationRun = typeof orchestrationRuns.$inferInsert;
