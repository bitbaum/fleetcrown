import { db } from "@/db";
import {
  ocBillingGrants,
  type NewOcBillingGrant,
  type OcBillingGrant,
} from "@/db/schema/billing-grants";
import { and, lt, ne, eq } from "drizzle-orm";
import { users } from "@/db/schema";

/**
 * Record an OrangeCat-rail grant, idempotently. `externalId` is unique, so a
 * retried/duplicate settlement webhook inserts nothing and returns null — the
 * caller then skips the plan write. Returns the row only on a genuinely new grant.
 */
export async function recordOcBillingGrant(
  input: NewOcBillingGrant,
): Promise<OcBillingGrant | null> {
  const [row] = await db
    .insert(ocBillingGrants)
    .values(input)
    .onConflictDoNothing({ target: ocBillingGrants.externalId })
    .returning();
  return row ?? null;
}

/**
 * Downgrade every user whose BTC pass has lapsed → free. Returns the count.
 * Only touches non-free users with an expiry in the past; Stripe subscribers
 * (planExpiresAt null) are untouched. Idempotent — a second run finds none.
 */
export async function downgradeExpiredPlans(now = new Date()): Promise<number> {
  const rows = await db
    .update(users)
    .set({ plan: "free", planStatus: "canceled", planExpiresAt: null, updatedAt: new Date() })
    .where(and(ne(users.plan, "free"), lt(users.planExpiresAt, now)))
    .returning({ id: users.id });
  return rows.length;
}

/** Grants for a user, most recent first — audit/history surface. */
export async function listOcBillingGrants(userId: string) {
  return db
    .select()
    .from(ocBillingGrants)
    .where(eq(ocBillingGrants.userId, userId))
    .orderBy(ocBillingGrants.createdAt);
}
