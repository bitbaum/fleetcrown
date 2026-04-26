import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  url: text("url"),
  location: text("location"),
  dateStart: timestamp("date_start", { withTimezone: true }),
  dateEnd: timestamp("date_end", { withTimezone: true }),
  deadline: timestamp("deadline", { withTimezone: true }),
  category: text("category"),
  status: text("status").default("active"),
  source: text("source"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_events_user_id").on(table.userId),
  index("idx_events_type").on(table.type),
  index("idx_events_status").on(table.status),
  index("idx_events_date_start").on(table.dateStart),
]);

// Avoids clashing with the DOM `Event` global, and matches the
// public name already used everywhere this type is consumed.
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
