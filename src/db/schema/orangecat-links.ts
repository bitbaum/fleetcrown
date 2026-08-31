import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { userProjects } from "./user-projects";

export type OrangeCatLinkRole = "origin" | "public_profile" | "funding" | "offering" | "community";

export const orangecatEntityLinks = pgTable(
  "orangecat_entity_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => userProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    role: text("role").$type<OrangeCatLinkRole>().notNull(),
    publicUrl: text("public_url").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_orangecat_entity_links_edge").on(t.projectId, t.entityType, t.entityId, t.role),
    index("idx_orangecat_entity_links_project").on(t.projectId),
    index("idx_orangecat_entity_links_entity").on(t.entityType, t.entityId),
  ],
);

export const orangecatBuildIntents = pgTable(
  "orangecat_build_intents",
  {
    jti: text("jti").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_orangecat_build_intents_expiry").on(t.expiresAt)],
);

export type OrangeCatEntityLink = typeof orangecatEntityLinks.$inferSelect;
