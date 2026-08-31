import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

// Per-user opt-in for periodic digest emails. One row per user. Absence of a
// row is equivalent to cadence="none" — we never spam an account that hasn't
// explicitly opted in.

export const DIGEST_CADENCES = ["none", "daily", "weekly", "monthly"] as const;
export type DigestCadence = (typeof DIGEST_CADENCES)[number];

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailDigestCadence: text("email_digest_cadence")
      .$type<DigestCadence>()
      .notNull()
      .default("none"),
    lastDigestSentAt: timestamp("last_digest_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_notification_preferences_user_id").on(table.userId)],
);

export type NotificationPreferencesRow = typeof notificationPreferences.$inferSelect;
