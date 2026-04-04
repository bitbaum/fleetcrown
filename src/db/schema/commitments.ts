import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export const commitments = pgTable("commitments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").default("active"),
  financialImpact: text("financial_impact"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_commitments_user_id").on(table.userId),
  index("idx_commitments_status").on(table.status),
  index("idx_commitments_due_date").on(table.dueDate),
]);

export type Commitment = typeof commitments.$inferSelect;
export type NewCommitment = typeof commitments.$inferInsert;
