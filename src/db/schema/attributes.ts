import { pgTable, uuid, text, timestamp, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export const attributes = pgTable("attributes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  entityId: uuid("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  confidence: real("confidence").default(1.0),
  source: text("source"),
  temporal: text("temporal").default("permanent"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_attributes_entity_id").on(table.entityId),
  index("idx_attributes_user_id").on(table.userId),
  index("idx_attributes_key").on(table.key),
  uniqueIndex("uq_attributes_entity_key").on(table.entityId, table.key),
]);

export type Attribute = typeof attributes.$inferSelect;
export type NewAttribute = typeof attributes.$inferInsert;
