import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export type DevLogEntry = {
  date: string;
  done: string;
  next: string;
  tests: string;
  todos: string;
  health: string;
};

export const userProjects = pgTable("user_projects", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityProjectId: uuid("entity_project_id").references(() => entities.id, { onDelete: "set null" }),
  name:        text("name").notNull(),          // display name + zellij tab identifier
  dirPath:     text("dir_path"),                // absolute local path (null = cloud-only)
  gitUrl:      text("git_url"),                 // GitHub / GitLab URL
  description: text("description"),
  stack:       text("stack"),
  agentPref:   text("agent_pref"),              // per-project agent override
  modelPref:   text("model_pref"),              // per-project model override
  position:    integer("position").default(0),  // user-defined sort order
  isActive:    boolean("is_active").default(true).notNull(),
  notes:       text("notes"),                    // free-form scratchpad visible in the profile panel
  devLog:      jsonb("dev_log").$type<DevLogEntry[]>().default([]).notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_user_projects_user_id").on(t.userId),
  index("idx_user_projects_user_active").on(t.userId, t.isActive),
  index("idx_user_projects_entity_project_id").on(t.entityProjectId),
]);

export type UserProject = typeof userProjects.$inferSelect;
export type NewUserProject = typeof userProjects.$inferInsert;
