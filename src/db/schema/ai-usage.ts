import { pgTable, uuid, integer, date, text, timestamp, unique, index } from "drizzle-orm/pg-core";

/**
 * What the day's AI tokens were spent ON — provider, model, and the feature
 * that asked for them.
 *
 * ── WHY A SECOND TABLE AND NOT A WIDER ai_spend ──────────────────────────────
 *
 * `ai_spend` answers "what has THIS USER spent today", and it is read on the
 * hot path of every chat turn by the admission gate. It must stay a point read
 * against one row per (user, day). Adding provider/model/feature to its key
 * would multiply those rows and turn the gate's point read into an aggregate —
 * paying for reporting on the path that rations.
 *
 * So the dimensions are split by the question each answers, not duplicated:
 *
 *   ai_spend  — WHO spent, and how much. Drives rationing.
 *   ai_usage  — WHAT it went to. Drives the capacity page.
 *
 * The user is deliberately NOT a column here. Loki is single-operator today,
 * the question this table exists for is about capacity rather than billing, and
 * a dimension that is not needed is a dimension that can disagree with the
 * other table. When per-user attribution per feature is genuinely wanted, add
 * it here and derive the totals — never record the same fact twice.
 *
 * ── WHY A ROLLUP ─────────────────────────────────────────────────────────────
 *
 * Same reasoning as ai_spend: the only questions asked are "where did today go"
 * and "which features are the expensive ones". A row-per-call log answers both
 * with a scan over a table that grows with traffic; this answers them from a
 * handful of rows a day. Per-call forensics belong in the activity stream.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** UTC day, matching ai_spend and the vendors' own reset boundary. */
    day: date("day").notNull(),
    /** Vendor id as the chain names it: groq, openrouter, google. */
    provider: text("provider").notNull(),
    /** The model that actually answered — Groq meters per model, so this matters. */
    model: text("model").notNull(),
    /**
     * WHO asked. A stable slug the caller declares, not a stack trace: the
     * point is that a reader recognises "activity digest" without knowing the
     * file it lives in. Required at the call site so a new caller cannot be
     * invisible — the whole reason this table exists is that fifteen of them
     * already were.
     */
    feature: text("feature").notNull(),
    tokens: integer("tokens").notNull().default(0),
    calls: integer("calls").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The upsert target. Without it two concurrent calls both read zero, both
    // insert, and the day reports twice as many rows at half the truth each.
    unique("uq_ai_usage_bucket").on(t.day, t.provider, t.model, t.feature),
    index("idx_ai_usage_day").on(t.day),
  ],
);

export type AiUsageRow = typeof aiUsage.$inferSelect;
