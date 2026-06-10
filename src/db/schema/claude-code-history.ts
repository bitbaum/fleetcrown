import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

// Per-event mirror of local Claude Code conversations. The CLI writes a JSONL
// transcript per session at ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl;
// scripts/ingest-claude-code-history.ts tails those files and lands user +
// assistant turns here so /activity unifies "what was dispatched from /control"
// with "what the founder typed locally to an agent."
//
// (sessionId, eventUuid) is unique → re-ingesting the same JSONL is idempotent
// and incremental ingest just needs to skip files where the newest event_uuid
// is already present.
export const claudeCodeHistory = pgTable("claude_code_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  // Optional FK to user_projects-equivalent entity. NULL when the JSONL's cwd
  // doesn't match any registered project (e.g. ad-hoc dirs).
  projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
  projectKey: text("project_key"),
  projectPath: text("project_path").notNull(),
  gitBranch: text("git_branch"),
  sessionId: text("session_id").notNull(),
  eventUuid: text("event_uuid").notNull(),
  promptType: text("prompt_type").$type<"user" | "assistant">().notNull(),
  promptText: text("prompt_text").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("idx_cc_history_session_event").on(t.sessionId, t.eventUuid),
  index("idx_cc_history_user_occurred").on(t.userId, t.occurredAt),
  index("idx_cc_history_project_key").on(t.projectKey),
]);

export type ClaudeCodeHistoryRow = typeof claudeCodeHistory.$inferSelect;
export type NewClaudeCodeHistoryRow = typeof claudeCodeHistory.$inferInsert;
