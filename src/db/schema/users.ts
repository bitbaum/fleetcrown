import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const PLAN_VALUES = ["free", "personal", "pro", "team"] as const;
export type Plan = typeof PLAN_VALUES[number];

export const PLAN_STATUS_VALUES = ["active", "past_due", "canceled"] as const;
export type PlanStatus = typeof PLAN_STATUS_VALUES[number];

/**
 * Per-user knobs that govern Fleet Runner's local lifecycle behavior —
 * cold-start restore, exited-session handling, login auto-start.
 * Stored as a JSON blob so we can add knobs without a migration each time.
 */
export type FleetLifecycleSettings = {
  /** When Fleet Runner boots, automatically bring zellij + fleet up. Default true. */
  autoRestore?: boolean;
  /** "fresh-spawn" wipes any exited zellij session and respawns from snapshot.
   *  "leave-alone" leaves zellij's resurrect file in place. Default "fresh-spawn". */
  restoreMode?: "fresh-spawn" | "leave-alone";
  /** Zellij session name FleetCrown owns. Default "fleet". */
  sessionName?: string;
  /** Add Fleet Runner to OS login items / systemd user units. Default true. */
  autoStartAtLogin?: boolean;
};

export const DEFAULT_FLEET_SETTINGS: Required<FleetLifecycleSettings> = {
  autoRestore: true,
  restoreMode: "fresh-spawn",
  sessionName: "fleet",
  autoStartAtLogin: true,
};

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
  /** See FleetLifecycleSettings — autoRestore / restoreMode / sessionName / autoStartAtLogin. */
  fleetSettings: jsonb("fleet_settings").$type<FleetLifecycleSettings>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
