import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Web Push subscriptions — one row per (user × device-browser). The Stop hook
 * fans out an autopilot notification to every row matching the runner's user
 * so the user gets an ambient signal on whichever device they're near (phone
 * after PWA install, desktop browser, both).
 *
 * Endpoint is the GUID — push services issue a unique URL per subscription;
 * UNIQUE constraint means resubscribing from the same device upserts cleanly.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** Browser label for the settings list ("Brave on linux", "iPhone Safari"). */
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_push_subscriptions_user_id").on(t.userId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
