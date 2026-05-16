import Stripe from "stripe";
import type { Plan } from "@/db/schema/users";

// Returns null when STRIPE_SECRET_KEY is not set — routes guard against this.
export const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export const STRIPE_PRICE_IDS: Record<Exclude<Plan, "free">, { monthly: string; annual: string }> = {
  personal: {
    monthly: process.env.STRIPE_PRICE_PERSONAL_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_PERSONAL_ANNUAL  ?? "",
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_PRO_ANNUAL  ?? "",
  },
  team: {
    monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY ?? "",
    annual:  process.env.STRIPE_PRICE_TEAM_ANNUAL  ?? "",
  },
};

export function isStripeReady(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}
