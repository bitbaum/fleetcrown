import type { Plan } from "@/db/schema/users";

/**
 * OrangeCat/Bitcoin checkout URL for a paid plan, or null when not configured.
 *
 * Each paid tier maps to an OrangeCat product/pass with a BTC price; the URL is
 * that pass's OC checkout. Read from env so the "Pay in Bitcoin" CTA lights up
 * the moment the OC-side passes exist — no code change.
 * Null everywhere today because the OC passes aren't created yet.
 */
export function orangeCatPayUrl(plan: Plan): string | null {
  const byPlan: Partial<Record<Plan, string | undefined>> = {
    personal: process.env.ORANGECAT_PAY_URL_PERSONAL,
    pro: process.env.ORANGECAT_PAY_URL_PRO,
    team: process.env.ORANGECAT_PAY_URL_TEAM,
  };
  const url = byPlan[plan]?.trim();
  return url ? url : null;
}

/** True when at least one paid tier has an OrangeCat BTC checkout configured. */
export function isOrangeCatPayReady(): boolean {
  return (["personal", "pro", "team"] as Plan[]).some((p) => orangeCatPayUrl(p) !== null);
}
