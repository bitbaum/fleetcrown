import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { Plan } from "./users";

/**
 * OrangeCat-rail entitlement ledger — one row per Bitcoin-paid FleetCrown pass.
 *
 * The `/api/orangecat/entitlement` webhook writes here on payment settlement.
 * `externalId` (the OC-side settlement id) is UNIQUE, so a retried/duplicate
 * webhook is a no-op — the row is the idempotency key AND the audit trail for
 * "who paid what, in BTC, granting which plan until when." Mirrors the
 * idempotent-by-payment_hash pattern OrangeCat's own Cat Credits ledger uses.
 */
export const ocBillingGrants = pgTable(
  "oc_billing_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** OC-side settlement id (payment/order id). Idempotency SSOT. */
    externalId: text("external_id").notNull().unique(),
    plan: text("plan").$type<Plan>().notNull(),
    /** Pass length in days; expiresAt = grantedAt + periodDays. */
    periodDays: integer("period_days").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** BTC amount paid, for the record (string to avoid float drift). */
    amountBtc: text("amount_btc"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_oc_billing_grants_user").on(t.userId)],
);

export type OcBillingGrant = typeof ocBillingGrants.$inferSelect;
export type NewOcBillingGrant = typeof ocBillingGrants.$inferInsert;
