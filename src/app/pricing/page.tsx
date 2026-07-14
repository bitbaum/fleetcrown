import Link from "next/link";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { isStripeReady } from "@/lib/stripe";
import { orangeCatPayUrl } from "@/lib/oc-pay";
import { ROUTES } from "@/config/auth";
import { APP_NAME } from "@/config/brand";
import {
  PRICING_PLANS,
  PRICING_INCLUDED,
  PRICING_CURRENCY,
  PRICING_BILLING_NOTE,
  type PricingPlan,
} from "@/config/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Command your fleet of AI agents. Free to start; paid plans add room to scale.",
};

/**
 * Public pricing. Honest about billing state: paid CTAs open Stripe checkout
 * only when it's configured (isStripeReady); until then every CTA routes to
 * a free signup — never a dead "Buy" button. Flips live automatically the
 * moment Stripe keys land, with no code change here.
 */
export default async function PricingPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const stripeReady = isStripeReady();

  // Resolve each plan's CTA target for the current state (signed-in? stripe live?).
  function ctaFor(plan: PricingPlan): { href: string; label: string } {
    if (plan.key === "free") {
      return signedIn
        ? { href: ROUTES.APP_HOME, label: `Open ${APP_NAME}` }
        : { href: ROUTES.SIGN_UP, label: plan.cta };
    }
    if (stripeReady) {
      return { href: `/api/checkout/${plan.key}`, label: plan.cta };
    }
    // Stripe blocked on incorporation — but the Bitcoin/OrangeCat rail needs no
    // merchant account. If this tier has an OC pass configured, offer it.
    const btc = orangeCatPayUrl(plan.key);
    if (btc) {
      return { href: btc, label: "Pay in Bitcoin" };
    }
    // Neither rail live yet — start free, upgrade in-app later.
    return signedIn
      ? { href: ROUTES.APP_HOME, label: `Open ${APP_NAME}` }
      : { href: ROUTES.SIGN_UP, label: "Start free" };
  }

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="ui-public-eyebrow">Pricing</div>
          <h1 className="ui-public-section-title mt-4">Pay for the captain, not the crew.</h1>
          <p className="ui-public-section-lede mx-auto mt-5">
            The agents run on your machine with your own keys. FleetCrown is the one place you
            command, watch, verify, and govern all of them. Start free — scale when your fleet does.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-4 sm:grid-cols-2">
          {PRICING_PLANS.map((plan) => {
            const cta = ctaFor(plan);
            return (
              <div
                key={plan.key}
                className={`ui-public-price-card${plan.featured ? " ui-public-price-card-featured" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
                  {plan.featured && <span className="ui-public-price-badge">Most popular</span>}
                </div>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="ui-public-price-amount">
                    {plan.priceMonthly === 0 ? "Free" : `${PRICING_CURRENCY} ${plan.priceMonthly}`}
                  </span>
                  {plan.priceMonthly > 0 && (
                    <span className="text-sm text-text-muted">/ mo</span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-snug text-text-secondary">{plan.tagline}</p>

                <ul className="mt-5 flex flex-col gap-2.5">
                  {plan.highlights.map((h) => (
                    <li key={h} className="ui-public-price-feature">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" aria-hidden />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={cta.href}
                  className={`mt-8 w-full text-center ${plan.featured ? "ui-public-cta" : "ui-public-cta-ghost"}`}
                >
                  {cta.label}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-text-muted">{PRICING_BILLING_NOTE}</p>

        {/* Every plan includes the captain layer — stated once, honestly, rather
            than faked as per-tier gates the product doesn't enforce. */}
        <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-border-subtle bg-surface-base p-6 sm:p-8">
          <div className="ui-public-eyebrow">Every plan includes</div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PRICING_INCLUDED.map((item) => (
              <li key={item} className="ui-public-price-feature">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </PublicSurface>
  );
}
