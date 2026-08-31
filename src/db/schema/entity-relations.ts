import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export const entityRelations = pgTable(
  "entity_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    strength: real("strength").default(1.0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    source: text("source"),
    confidence: real("confidence").default(1.0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_relations_type").on(table.type),
    index("idx_relations_user_id").on(table.userId),
    index("idx_relations_from").on(table.fromEntityId),
    index("idx_relations_to").on(table.toEntityId),
    uniqueIndex("uq_relations_edge").on(
      table.userId,
      table.fromEntityId,
      table.type,
      table.toEntityId,
    ),
  ],
);

export type EntityRelation = typeof entityRelations.$inferSelect;
export type NewEntityRelation = typeof entityRelations.$inferInsert;
