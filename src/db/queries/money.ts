import { db } from "@/db";
import { subscriptions, commitments } from "@/db/schema";
import { syncSubscriptionToOrangeCat } from "@/lib/integrations/orangecat";

type SubscriptionRow = typeof subscriptions.$inferSelect;
import { eq, and, sql } from "drizzle-orm";
import { SUB_STATUS, COMMITMENT_STATUS, type SubStatus } from "@/lib/constants/statuses";
import {
  FREQUENCY,
  VALID_CURRENCIES, VALID_FREQUENCIES,
  type SubscriptionCurrency, type SubscriptionFrequency,
} from "@/config/subscriptions";
import { z } from "zod";

const CURRENCIES_ENUM = VALID_CURRENCIES as readonly [SubscriptionCurrency, ...SubscriptionCurrency[]];
const FREQUENCIES_ENUM = VALID_FREQUENCIES as readonly [SubscriptionFrequency, ...SubscriptionFrequency[]];
const SUB_STATUSES = Object.values(SUB_STATUS) as [SubStatus, ...SubStatus[]];

export const CreateSubscriptionBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  vendor: z.string().trim().optional(),
  amount: z.number().optional(),
  currency: z.enum(CURRENCIES_ENUM, { error: `currency must be one of: ${VALID_CURRENCIES.join(", ")}` }).default("CHF"),
  frequency: z.enum(FREQUENCIES_ENUM, { error: `frequency must be one of: ${VALID_FREQUENCIES.join(", ")}` }).default(FREQUENCY.MONTHLY),
  nextDue: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid date").optional(),
  paymentMethod: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionBody>;

export const PatchSubscriptionBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    vendor: z.string().optional(),
    amount: z.number().nullable().optional(),
    currency: z.enum(CURRENCIES_ENUM, { error: "Invalid currency" }).optional(),
    frequency: z.enum(FREQUENCIES_ENUM, { error: "Invalid frequency" }).optional(),
    nextDue: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid date").nullable().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(SUB_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

type PatchSubscriptionInput = z.infer<typeof PatchSubscriptionBody>;

export async function createSubscription(userId: string, data: CreateSubscriptionInput) {
  const [created] = await db
    .insert(subscriptions)
    .values({
      userId,
      name: data.name,
      vendor: data.vendor || null,
      amount: data.amount ?? null,
      currency: data.currency,
      frequency: data.frequency,
      nextDue: data.nextDue ? new Date(data.nextDue) : null,
      paymentMethod: data.paymentMethod || null,
      notes: data.notes || null,
      status: SUB_STATUS.ACTIVE,
    })
    .returning();

  // Loop A: mirror the subscription into OrangeCat as a `service` record.
  // Fire-and-forget — a network blip on OrangeCat must not fail the
  // subscription POST. The integration no-ops when ORANGECAT_API_KEY is
  // unset, which is the case for most dev environments today.
  if (created) {
    void syncSubscriptionToOrangeCat({
      id: created.id,
      name: created.name,
      vendor: created.vendor,
      amount: created.amount,
      currency: created.currency,
      frequency: created.frequency,
      notes: created.notes,
    });
  }

  return created;
}

export async function patchSubscription(userId: string, id: string, data: PatchSubscriptionInput) {
  const patch: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date() };
  if (data.nextDue !== undefined) patch.nextDue = data.nextDue ? new Date(data.nextDue) : null;
  if (data.amount !== undefined) patch.amount = data.amount;
  if (data.notes !== undefined) patch.notes = data.notes.trim() || null;
  if (data.status !== undefined) patch.status = data.status;
  if (data.name !== undefined) patch.name = data.name;
  if (data.vendor !== undefined) patch.vendor = data.vendor.trim() || null;
  if (data.paymentMethod !== undefined) patch.paymentMethod = data.paymentMethod.trim() || null;
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.frequency !== undefined) patch.frequency = data.frequency;
  const [updated] = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .returning();

  // Re-sync the OrangeCat mirror after an edit so an amount/frequency
  // change does not leave the OC `service` record stale. Same
  // fire-and-forget contract as createSubscription — a network blip on
  // OrangeCat must never fail the PATCH. The integration no-ops when
  // ORANGECAT_API_KEY is unset (most dev environments).
  if (updated) {
    void syncSubscriptionToOrangeCat({
      id: updated.id,
      name: updated.name,
      vendor: updated.vendor,
      amount: updated.amount,
      currency: updated.currency,
      frequency: updated.frequency,
      notes: updated.notes,
    });
  }

  return updated ?? null;
}

export async function deleteSubscription(userId: string, id: string) {
  const [deleted] = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .returning({ id: subscriptions.id });
  return deleted ?? null;
}

export async function getAllSubscriptions(userId: string) {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(sql`
      CASE ${subscriptions.status}
        WHEN ${SUB_STATUS.ACTIVE} THEN 1
        WHEN ${SUB_STATUS.UNVERIFIED} THEN 2
        WHEN ${SUB_STATUS.CANCELLED} THEN 3
        ELSE 4
      END,
      ${subscriptions.amount} DESC NULLS LAST
    `);
}

export async function getFinancialCommitments(userId: string) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, userId),
        eq(commitments.status, COMMITMENT_STATUS.ACTIVE),
        sql`${commitments.financialImpact} IS NOT NULL AND ${commitments.financialImpact} != ''`,
      ),
    )
    .orderBy(commitments.dueDate);
}

export type MonthlyBurn = {
  totalChf: number;
  totalUsd: number;
  totalEur: number;
  totalGbp: number;
  count: number;
};

export async function cancelSubscription(id: string, userId: string) {
  await db
    .update(subscriptions)
    .set({ status: SUB_STATUS.CANCELLED, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
}

/**
 * Reactivate a cancelled subscription — flips status back to active so a
 * cancellation is reversible without delete + recreate (which would lose
 * amount/frequency/notes). Returns the updated row, or null when no row
 * matched (wrong id / not owned by user).
 */
export async function reactivateSubscription(id: string, userId: string) {
  const [updated] = await db
    .update(subscriptions)
    .set({ status: SUB_STATUS.ACTIVE, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .returning();
  return updated ?? null;
}

export function calculateMonthlyBurn(
  subs: SubscriptionRow[],
): MonthlyBurn {
  const totals: Record<string, number> = { CHF: 0, USD: 0, EUR: 0, GBP: 0 };

  for (const sub of subs) {
    if (!sub.amount || sub.frequency === FREQUENCY.ONE_TIME) continue;
    const monthly =
      sub.frequency === FREQUENCY.ANNUAL    ? sub.amount / 12
      : sub.frequency === FREQUENCY.QUARTERLY ? sub.amount / 3
      : sub.frequency === FREQUENCY.WEEKLY    ? sub.amount * (52 / 12)
      : sub.amount; // monthly

    const key = sub.currency && sub.currency in totals ? sub.currency : "USD";
    totals[key] += monthly;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    totalChf: round(totals.CHF),
    totalUsd: round(totals.USD),
    totalEur: round(totals.EUR),
    totalGbp: round(totals.GBP),
    count: subs.length,
  };
}
