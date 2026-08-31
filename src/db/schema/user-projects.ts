import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

export type ProjectResource = {
  id: string;
  kind: "link" | "doc" | "spec" | "dataset" | "credential" | "environment" | "design" | "other";
  visibility?: "private" | "team" | "public";
  sensitivity?: "normal" | "internal" | "secret" | "credential";
  title: string;
  url?: string;
  notes?: string;
  createdAt: string;
};

export const userProjects = pgTable(
  "user_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    entityProjectId: uuid("entity_project_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(), // display name + zellij tab identifier
    dirPath: text("dir_path"), // absolute local path (null = cloud-only)
    gitUrl: text("git_url"), // GitHub / GitLab URL
    // Where this project lives on the public web. FleetCrown knew every project's
    // REPO but never its SITE, so "give me the link" was a question only a human
    // (or an agent with ssh) could answer. This is the SSOT for that answer;
    // site_snapshots holds what probing the URL actually found.
    liveUrl: text("live_url"), // public site URL (null = not deployed)
    description: text("description"),
    stack: text("stack"),
    agentPref: text("agent_pref"), // per-project agent override
    modelPref: text("model_pref"), // per-project model override
    position: integer("position").default(0), // user-defined sort order
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"), // free-form scratchpad visible in the profile panel
    resources: jsonb("resources").$type<ProjectResource[]>().default([]).notNull(),
    devLog: jsonb("dev_log").$type<DevLogEntry[]>().default([]).notNull(),
    // Cross-product bridge Part C: the published OrangeCat project this project
    // projects onto (opt-in "Publish to OrangeCat"). Null = not published.
    orangecatProjectId: uuid("orangecat_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_user_projects_user_id").on(t.userId),
    index("idx_user_projects_user_active").on(t.userId, t.isActive),
    index("idx_user_projects_entity_project_id").on(t.entityProjectId),
    index("idx_user_projects_org_id").on(t.orgId),
    // One project name per owner. Feeds project_states' (user_id, project_key) PK —
    // without this, a user could register two "cockpit" projects and their runtime
    // state would silently merge.
    uniqueIndex("uq_user_projects_user_name").on(t.userId, t.name),
  ],
);

export type UserProject = typeof userProjects.$inferSelect;
export type NewUserProject = typeof userProjects.$inferInsert;
