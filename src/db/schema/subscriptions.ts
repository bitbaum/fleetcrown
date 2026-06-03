import { pgTable, uuid, text, timestamp, real, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { SUB_STATUS, type SubStatus } from "@/lib/constants/statuses";
import { FREQUENCY, type SubscriptionFrequency, type SubscriptionCurrency } from "@/config/subscriptions";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  vendor: text("vendor"),
  amount: real("amount"),
  currency: text("currency").$type<SubscriptionCurrency>().default("CHF"),
  frequency: text("frequency").$type<SubscriptionFrequency>().default(FREQUENCY.MONTHLY),
  category: text("category"),
  status: text("status").$type<SubStatus>().default(SUB_STATUS.ACTIVE),
  nextDue: timestamp("next_due", { withTimezone: true }),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  // OrangeCat link — service id we mirrored this subscription into via
  // syncSubscriptionToOrangeCat. Null when the integration isn't
  // configured, when the sync failed, or for rows created before the
  // integration shipped.
  orangecatServiceId: uuid("orangecat_service_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_subscriptions_user_id").on(table.userId),
  index("idx_subscriptions_status").on(table.status),
  index("idx_subscriptions_next_due").on(table.nextDue),
]);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
