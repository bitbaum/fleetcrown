import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export const projectShares = pgTable("project_shares", {
  id:          uuid("id").primaryKey().defaultRandom(),
  projectId:   uuid("project_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:       text("token").notNull().unique(),
  audience:    text("audience").notNull().default("advisor"),
  includeRoadmap:   boolean("include_roadmap").notNull().default(true),
  includeChangelog: boolean("include_changelog").notNull().default(true),
  includeResources: boolean("include_resources").notNull().default(true),
  includeRepo:      boolean("include_repo").notNull().default(false),
  includeLiveUrl:   boolean("include_live_url").notNull().default(true),
  revokedAt:   timestamp("revoked_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_project_shares_token").on(t.token),
  index("idx_project_shares_project_id").on(t.projectId),
  index("idx_project_shares_user_id").on(t.userId),
]);

export type ProjectShare = typeof projectShares.$inferSelect;
export type NewProjectShare = typeof projectShares.$inferInsert;
