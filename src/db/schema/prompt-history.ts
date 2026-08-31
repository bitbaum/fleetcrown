import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { orchestrationRuns } from "./orchestration-runs";
import type { AdapterId, OrchestrationTaskIntentId } from "@/lib/orchestration";

export const promptHistory = pgTable(
  "prompt_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
    projectKey: text("project_key").notNull(),
    projectPath: text("project_path").notNull(),
    adapter: text("adapter").$type<AdapterId>().notNull(),
    intent: text("intent").$type<OrchestrationTaskIntentId>().notNull(),
    customPrompt: text("custom_prompt"),
    // The fully rendered prompt body sent to the agent — populated for every new
    // dispatch (custom and intent-based). Historical rows before this column
    // existed remain NULL; the activity view falls back to customPrompt or the
    // intent label. Lets digests and the event stream show actual prompt text
    // for "Next best" dispatches instead of the meaningless intent slug.
    resolvedPrompt: text("resolved_prompt"),
    // The orchestration run this prompt became — THE join self-improvement-plan.md
    // names as the blocker for learning from our own trajectories. Before this
    // column the only join was (userId, projectKey, adapter, intent,
    // time-proximity), which is lossy under concurrency — and concurrency is the
    // normal operating state. Nullable on purpose: activity-capture rows record
    // prompts typed straight into a terminal, where no run exists; for a
    // DISPATCH, the writer creates the run first and links it here. SET NULL on
    // delete: losing the run must not erase the prompt from the ledger.
    runId: uuid("run_id").references(() => orchestrationRuns.id, { onDelete: "set null" }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_prompt_history_user_id").on(table.userId),
    index("idx_prompt_history_project_id").on(table.projectId),
    index("idx_prompt_history_project_key").on(table.projectKey),
    index("idx_prompt_history_dispatched_at").on(table.dispatchedAt),
    index("idx_prompt_history_run_id").on(table.runId),
  ],
);

export type PromptHistoryRow = typeof promptHistory.$inferSelect;
export type NewPromptHistoryRow = typeof promptHistory.$inferInsert;
