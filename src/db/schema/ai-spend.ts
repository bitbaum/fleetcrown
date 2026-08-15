import { pgTable, uuid, integer, date, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Per-user, per-day AI token spend — the ledger fair-share rationing reads.
 *
 * One row per (user, UTC day). The day is a `date` rather than a timestamp
 * because that is exactly the granularity the providers meter on: the free
 * tiers reset daily, so the accounting bucket and the quota bucket must be the
 * same thing or the rationing drifts away from the budget it is rationing.
 *
 * UTC, not local time. The vendors reset on UTC midnight; bucketing on the
 * operator's local midnight would hand out a share against a budget that had
 * not refilled yet.
 *
 * Why a rollup and not an event log: the only questions asked of this table are
 * "what has this user spent today" and "how many users drew today", both on the
 * hot path of every chat turn. A row-per-turn log answers both with an
 * aggregate over an ever-growing table; a rollup answers them with a point read
 * and a small count. If per-turn forensics are ever needed they belong in the
 * activity stream, which already exists for that.
 */
export const aiSpend = pgTable("ai_spend", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** UTC day this spend belongs to (YYYY-MM-DD). */
  day: date("day").notNull(),
  /** Tokens drawn by this user on this day, across every provider. */
  tokens: integer("tokens").notNull().default(0),
  /** Turns taken, so a cost-per-turn estimate can be recalibrated from reality. */
  turns: integer("turns").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The upsert target. Without this the increment races: two concurrent turns
  // both read zero, both insert, and one user gets two rows and twice the share.
  unique("uq_ai_spend_user_day").on(t.userId, t.day),
  // Counting distinct users for a day is the divisor in every fair-share
  // decision, so it runs on every turn.
  index("idx_ai_spend_day").on(t.day),
]);

export type AiSpend = typeof aiSpend.$inferSelect;
export type NewAiSpend = typeof aiSpend.$inferInsert;
