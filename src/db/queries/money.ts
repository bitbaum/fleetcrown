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
    .orderBy(subscriptions.nextDue);
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
  count: number;
};

export function calculateMonthlyBurn(
  subs: Awaited<ReturnType<typeof getActiveSubscriptions>>,
): MonthlyBurn {
  let totalChf = 0;
  let totalUsd = 0;

  for (const sub of subs) {
    if (!sub.amount) continue;
    const monthly =
      sub.frequency === "annual"
        ? sub.amount / 12
        : sub.frequency === "quarterly"
          ? sub.amount / 3
          : sub.amount;

    if (sub.currency === "CHF") totalChf += monthly;
    else if (sub.currency === "USD") totalUsd += monthly;
    else totalUsd += monthly; // default to USD for unknown
  }

  return {
    totalChf: Math.round(totalChf * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    count: subs.length,
  };
}
