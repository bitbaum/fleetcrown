import Link from "next/link";
import { PRICING_BILLING_NOTE } from "@/config/plans";
import type { Plan } from "@/db/schema/users";

const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  personal: "Personal",
  pro: "Pro",
  team: "Team",
};

type Props = {
  plan: Plan;
  planStatus: string | null;
};

/**
 * What plan you are on, and where to change it.
 *
 * This used to be a Stripe checkout surface: a tier grid, an upgrade handler
 * posting to /api/stripe/checkout, a "Manage subscription" button opening the
 * billing portal, and — because `isStripeReady()` was false in every
 * environment — a permanent notice telling the reader to "add STRIPE_SECRET_KEY
 * and price IDs". None of it could ever run, and the one part that DID render
 * asked a person who does not deploy the app to set an environment variable.
 *
 * Stripe is gone (nothing was ever configured, no user row ever held a customer
 * id). Plans themselves are real and stay: they are granted through the
 * OrangeCat/Bitcoin rail at /api/orangecat/entitlement, with the expiry cron
 * reverting a lapsed pass to free. So this section states the plan and points
 * at the page that explains the tiers, rather than offering a checkout that
 * does not exist.
 *
 * No "use client": with the handlers gone there is no state, no effect and no
 * search-param read left in it.
 */
export function BillingSettings({ plan, planStatus }: Props) {
  return (
    <section className="ui-settings-section">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium text-text-primary">Billing</h2>
          <p className="text-sm text-text-tertiary">
            Current plan:{" "}
            <span className="font-medium text-text-secondary">{PLAN_LABEL[plan]}</span>
            {planStatus === "past_due" && (
              <span className="ml-2 text-xs text-status-warning">· payment past due</span>
            )}
          </p>
        </div>
        <Link href="/pricing" className="ui-btn-secondary shrink-0 text-sm">
          See plans
        </Link>
      </div>
      <p className="text-xs text-text-muted">{PRICING_BILLING_NOTE}</p>
    </section>
  );
}
