import { pgTable, text, timestamp, uuid, index, boolean, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export const projectStates = pgTable("project_states", {
  userId:                 uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectKey:             text("project_key").notNull(),
  projectId:              uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
  tabName:                text("tab_name").notNull(),
  agentRunning:           boolean("agent_running").notNull().default(false),
  tabOpen:                boolean("tab_open").notNull().default(false),
  activeAgents:           text("active_agents").array().notNull().default([]),
  readyAt:                timestamp("ready_at",   { withTimezone: true }),
  lockAt:                 timestamp("lock_at",    { withTimezone: true }),
  closingAt:              timestamp("closing_at", { withTimezone: true }),
  closedAt:               timestamp("closed_at",  { withTimezone: true }),
  sessionDone:            text("session_done"),
  sessionNext:            text("session_next"),
  sessionTests:           text("session_tests"),
  sessionTodos:           text("session_todos"),
  sessionHealth:          text("session_health"),
  sessionUpdatedAt:       timestamp("session_updated_at", { withTimezone: true }),
  currentPromptKey:       text("current_prompt_key"),
  currentPromptLabel:     text("current_prompt_label"),
  currentPromptStartedAt: timestamp("current_prompt_started_at", { withTimezone: true }),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.projectKey] }),
  index("idx_project_states_user_id").on(table.userId),
  index("idx_project_states_project_id").on(table.projectId),
]);

export type ProjectState    = typeof projectStates.$inferSelect;
export type NewProjectState = typeof projectStates.$inferInsert;
