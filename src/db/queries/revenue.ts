import { db } from "@/db";
import { users } from "@/db/schema";
import { ocBillingGrants } from "@/db/schema/billing-grants";
import { sql, and, ne, or, gt, isNull, desc } from "drizzle-orm";
import { PRICING_PLANS, PRICING_CURRENCY } from "@/config/plans";
import type { Plan } from "@/db/schema/users";

/**
 * Platform revenue observability — the money-truth layer the business model
 * analysis (2026-07-19) flagged as the least-built part of the whole thesis.
 * If improvement loops are only honest when they touch settled money, the
 * operator needs one place that sums it. Read-only; founder-scoped in the UI.
 *
 * "Active paid" = any non-free plan whose pass hasn't lapsed. Grants carry
 * a null expiry (recurring); BTC passes carry a future expiry. The daily
 * downgrade cron flips lapsed passes back to free, so a non-free row with a
 * null-or-future expiry is genuinely paying right now.
 */
// A to-be-announced price (null) contributes 0 MRR — nothing is being charged.
const PRICE_BY_PLAN = Object.fromEntries(
  PRICING_PLANS.map((p) => [p.key, p.priceMonthly ?? 0]),
) as Record<Plan, number>;

export type RevenueByPlan = { plan: Plan; count: number; monthly: number };

export type RevenueSummary = {
  currency: string;
  /** Monthly-recurring, normalized (annual plans shown per-month equivalent). */
  mrr: number;
  activePaid: number;
  freeUsers: number;
  byPlan: RevenueByPlan[];
  btcGrantCount: number;
  btcGrantTotal: number;
  recentGrants: {
    plan: Plan;
    amountBtc: string | null;
    createdAt: Date;
    expiresAt: Date;
  }[];
};

export async function getRevenueSummary(now = new Date()): Promise<RevenueSummary> {
  const activePaid = and(
    ne(users.plan, "free"),
    or(isNull(users.planExpiresAt), gt(users.planExpiresAt, now)),
  );

  const [planRows, freeRow, grantAgg, recent] = await Promise.all([
    db
      .select({ plan: users.plan, count: sql<number>`count(*)::int` })
      .from(users)
      .where(activePaid)
      .groupBy(users.plan),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.plan} = 'free'`),
    db
      .select({
        count: sql<number>`count(*)::int`,
        // amountBtc is text and may be "" (OC sends "" when amount is null).
        total: sql<string>`coalesce(sum(nullif(${ocBillingGrants.amountBtc}, '')::numeric), 0)`,
      })
      .from(ocBillingGrants),
    db
      .select({
        plan: ocBillingGrants.plan,
        amountBtc: ocBillingGrants.amountBtc,
        createdAt: ocBillingGrants.createdAt,
        expiresAt: ocBillingGrants.expiresAt,
      })
      .from(ocBillingGrants)
      .orderBy(desc(ocBillingGrants.createdAt))
      .limit(5),
  ]);

  const byPlan: RevenueByPlan[] = planRows
    .map((r) => ({
      plan: r.plan,
      count: r.count,
      monthly: r.count * (PRICE_BY_PLAN[r.plan] ?? 0),
    }))
    .sort((a, b) => b.monthly - a.monthly);

  return {
    currency: PRICING_CURRENCY,
    mrr: byPlan.reduce((sum, r) => sum + r.monthly, 0),
    activePaid: byPlan.reduce((sum, r) => sum + r.count, 0),
    freeUsers: freeRow[0]?.count ?? 0,
    byPlan,
    btcGrantCount: grantAgg[0]?.count ?? 0,
    btcGrantTotal: Number(grantAgg[0]?.total ?? 0),
    recentGrants: recent,
  };
}
