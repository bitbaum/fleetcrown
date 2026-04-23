import { DEFAULT_USER_ID } from "@/lib/constants";
import { db } from "@/db";
import { subscriptions, commitments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function getActiveSubscriptions() {
  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, DEFAULT_USER_ID),
        eq(subscriptions.status, "active"),
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
      CASE status
        WHEN 'active' THEN 1
        WHEN 'unverified' THEN 2
        WHEN 'cancelled' THEN 3
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
        eq(commitments.status, "active"),
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
