import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { orgs } from "./orgs";

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
  orgId:       uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
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
  index("idx_user_projects_org_id").on(t.orgId),
  // One project name per owner. Feeds project_states' (user_id, project_key) PK —
  // without this, a user could register two "cockpit" projects and their runtime
  // state would silently merge.
  uniqueIndex("uq_user_projects_user_name").on(t.userId, t.name),
]);

export type UserProject = typeof userProjects.$inferSelect;
export type NewUserProject = typeof userProjects.$inferInsert;
