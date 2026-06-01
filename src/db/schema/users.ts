import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const PLAN_VALUES = ["free", "personal", "pro", "team"] as const;
export type Plan = typeof PLAN_VALUES[number];

export const PLAN_STATUS_VALUES = ["active", "past_due", "canceled"] as const;
export type PlanStatus = typeof PLAN_STATUS_VALUES[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  isDefault: boolean("is_default").default(false),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  // Billing
  plan: text("plan").$type<Plan>().default("free").notNull(),
  planStatus: text("plan_status").$type<PlanStatus>(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  // Private-zone PIN — scrypt hash in `<hash>.<salt>` format. Null = no PIN
  // configured for this user; the gate stays open. Each user sets / changes
  // / disables their own PIN through Settings → Privacy.
  privateZonePinHash: text("private_zone_pin_hash"),
  privateZonePinSetAt: timestamp("private_zone_pin_set_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
