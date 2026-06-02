import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),          // overdue_commitment, stale_relationship, ci_failure, bill_due, etc.
  severity: text("severity").notNull(),  // info, warning, urgent
  title: text("title").notNull(),
  description: text("description"),
  entityId: uuid("entity_id"),           // optional link to an entity
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  dismissed: boolean("dismissed").default(false),
  actionUrl: text("action_url"),         // link to relevant FleetCrown page
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
}, (table) => [
  index("idx_alerts_user_id").on(table.userId),
  index("idx_alerts_type").on(table.type),
  index("idx_alerts_dismissed").on(table.dismissed),
  index("idx_alerts_severity").on(table.severity),
  index("idx_alerts_created_at").on(table.createdAt),
]);

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
