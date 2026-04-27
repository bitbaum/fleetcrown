import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { subscriptions, commitments } from "@/db/schema";
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
  nextDue: z.string().optional(),
  paymentMethod: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const PatchSubscriptionBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    vendor: z.string().optional(),
    amount: z.number().nullable().optional(),
    currency: z.enum(CURRENCIES_ENUM, { error: "Invalid currency" }).optional(),
    frequency: z.enum(FREQUENCIES_ENUM, { error: "Invalid frequency" }).optional(),
    nextDue: z.string().nullable().optional(),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(SUB_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function getActiveSubscriptions() {
  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, DEFAULT_USER_ID),
        eq(subscriptions.status, SUB_STATUS.ACTIVE),
      ),
    )
    .orderBy(sql`${subscriptions.amount} DESC NULLS LAST`);
}

export async function getAllSubscriptions() {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, DEFAULT_USER_ID))
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

export async function getFinancialCommitments() {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.userId, DEFAULT_USER_ID),
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

export async function cancelSubscription(id: string) {
  await db
    .update(subscriptions)
    .set({ status: SUB_STATUS.CANCELLED, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, DEFAULT_USER_ID)));
}

export function calculateMonthlyBurn(
  subs: Awaited<ReturnType<typeof getActiveSubscriptions>>,
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
