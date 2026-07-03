import { pgTable, text, timestamp, uuid, index, uniqueIndex, boolean, integer, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { entities } from "./entities";

export const projectStates = pgTable("project_states", {
  userId:                 uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectKey:             text("project_key").notNull(),
  projectId:              uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
  workspaceId:            text("workspace_id"),
  tabName:                text("tab_name").notNull(),
  agentRunning:           boolean("agent_running").notNull().default(false),
  tabOpen:                boolean("tab_open").notNull().default(false),
  activeAgents:           text("active_agents").array().notNull().default([]),
  readyAt:                timestamp("ready_at",   { withTimezone: true }),
  lockAt:                 timestamp("lock_at",    { withTimezone: true }),
  closingAt:              timestamp("closing_at", { withTimezone: true }),
  closedAt:               timestamp("closed_at",  { withTimezone: true }),
  sessionStatus:          text("session_status"),     // 'ready' | 'working' | null. Drives auto-inject gating — only 'ready' fires.
  autoContinueEnabled:    boolean("auto_continue_enabled").notNull().default(true),
  promptQueue:            text("prompt_queue").array().notNull().default([]),  // per-project prompt queue. Replaces the ephemeral /tmp/agent-queue-<tab> mirror.
  promptQueueRevision:    integer("prompt_queue_revision").notNull().default(0), // CAS version: prevents concurrent clients from losing queue edits.
  sessionDone:            text("session_done"),
  sessionNext:            text("session_next"),
  sessionTests:           text("session_tests"),
  sessionTodos:           text("session_todos"),
  sessionHealth:          text("session_health"),
  // 2026-06-08 — explicit loop-control fields added so the autopilot decision
  // (skip vs. fire) reads structured data instead of content-sniffing the
  // free-text done:/health: strings. See src/lib/orchestration/contract.ts.
  sessionBlockReason:     text("session_block_reason"),     // 'awaiting_user' | 'external_dependency' | 'manual_pause' | null
  sessionNoOpCount:       integer("session_no_op_count"),   // consecutive no-op turns; agent increments each turn
  sessionUpdatedAt:       timestamp("session_updated_at", { withTimezone: true }),
  currentPromptKey:       text("current_prompt_key"),
  currentPromptLabel:     text("current_prompt_label"),
  currentPromptStartedAt: timestamp("current_prompt_started_at", { withTimezone: true }),
  runtimeObservedAt:      timestamp("runtime_observed_at", { withTimezone: true }),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.projectKey] }),
  index("idx_project_states_user_id").on(table.userId),
  index("idx_project_states_project_id").on(table.projectId),
  index("idx_project_states_workspace_id").on(table.workspaceId),
  // Case-insensitive uniqueness: the composite PK above is case-sensitive,
  // so 'cockpit' and 'FleetCrown' would otherwise create duplicate rows. See
  // drizzle/0012_project_states_unique_lower_key.sql for the migration that
  // backfilled this on existing data.
  uniqueIndex("idx_project_states_user_lower_key").on(table.userId, sql`lower(${table.projectKey})`),
]);

export type ProjectState    = typeof projectStates.$inferSelect;
export type NewProjectState = typeof projectStates.$inferInsert;
