import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { subscriptions, commitments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { SUB_STATUS, COMMITMENT_STATUS } from "@/lib/constants/statuses";

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
    if (!sub.amount || sub.frequency === "one-time") continue;
    const monthly =
      sub.frequency === "annual"    ? sub.amount / 12
      : sub.frequency === "quarterly" ? sub.amount / 3
      : sub.frequency === "weekly"    ? sub.amount * (52 / 12)
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
