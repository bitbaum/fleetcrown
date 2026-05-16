import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// Commands queued by the cloud control plane for the local runtime node to execute.
// The local daemon polls this table, claims rows, executes them via zellij, and marks them done.
export const pendingCommands = pgTable("pending_commands", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:        text("type").notNull(),           // "inject" | "focus_tab" | "launch_agent" | "switch_agent"
  payload:     jsonb("payload").notNull(),        // command-specific fields
  createdAt:   timestamp("created_at",  { withTimezone: true }).defaultNow().notNull(),
  claimedAt:   timestamp("claimed_at",  { withTimezone: true }),
  executedAt:  timestamp("executed_at", { withTimezone: true }),
  result:      jsonb("result"),                   // { ok: boolean, error?: string }
}, (table) => [
  index("idx_pending_commands_user_id").on(table.userId),
  index("idx_pending_commands_created_at").on(table.createdAt),
]);

export type PendingCommand    = typeof pendingCommands.$inferSelect;
export type NewPendingCommand = typeof pendingCommands.$inferInsert;

export type InjectPayload = {
  tab: string;
  prompt: string;
  promptKey?: string;
  promptLabel?: string;
  adapter?: string;
  projectId?: string | null;
  projectKey?: string;
};

export type SwitchAgentPayload = {
  tab: string;
  dir: string;
  toAgent: string;
  fromAgent?: string;
  model?: string;
};
