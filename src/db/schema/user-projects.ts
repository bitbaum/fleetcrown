import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userProjects = pgTable("user_projects", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),          // display name + zellij tab identifier
  dirPath:     text("dir_path"),                // absolute local path (null = cloud-only)
  gitUrl:      text("git_url"),                 // GitHub / GitLab URL
  description: text("description"),
  stack:       text("stack"),
  agentPref:   text("agent_pref"),              // per-project agent override
  modelPref:   text("model_pref"),              // per-project model override
  position:    integer("position").default(0),  // user-defined sort order
  isActive:    boolean("is_active").default(true).notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_user_projects_user_id").on(t.userId),
  index("idx_user_projects_user_active").on(t.userId, t.isActive),
]);

export type UserProject = typeof userProjects.$inferSelect;
export type NewUserProject = typeof userProjects.$inferInsert;
