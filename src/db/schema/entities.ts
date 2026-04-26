import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { type EntityType } from "@/lib/constants/statuses";

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: text("type").$type<EntityType>().notNull(),
  externalId: text("external_id"),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_entities_type").on(table.type),
  index("idx_entities_user_id").on(table.userId),
  index("idx_entities_external_id").on(table.externalId),
  index("idx_entities_source").on(table.source),
  uniqueIndex("uq_entities_user_name_type").on(table.userId, table.name, table.type),
]);

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
