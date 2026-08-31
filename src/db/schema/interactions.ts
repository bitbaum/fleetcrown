import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { type InteractionDirection } from "@/lib/constants/statuses";

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    direction: text("direction").$type<InteractionDirection>().notNull(),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_interactions_entity_id").on(table.entityId),
    index("idx_interactions_user_id").on(table.userId),
    index("idx_interactions_channel").on(table.channel),
    index("idx_interactions_occurred_at").on(table.occurredAt),
  ],
);

export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
