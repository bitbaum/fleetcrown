import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const projectStates = pgTable("project_states", {
  projectKey:             text("project_key").primaryKey(),
  tabName:                text("tab_name").notNull(),
  readyAt:                timestamp("ready_at",   { withTimezone: true }),
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
});

export type ProjectState    = typeof projectStates.$inferSelect;
export type NewProjectState = typeof projectStates.$inferInsert;
