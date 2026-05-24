import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserCount } from "@/db/queries/users";
import { PublicSurface } from "@/components/public/PublicSurface";
import {
  LANDING_FEATURES,
  LANDING_FOOTER,
  LANDING_HEADLINE,
  LANDING_PRICING,
  LANDING_SUBTITLE,
  LANDING_WHITEPAPER_LABEL,
} from "@/config/marketing";
import { isStripeReady } from "@/lib/stripe";
import { ROUTES, PUBLIC_NAV_LINKS } from "@/config/auth";

export default async function LandingPage() {
  if ((await getUserCount()) === 0) redirect("/setup");

  const session = await auth();
  if (session?.user) {
    const done =
      session.user.onboardingComplete === true ||
      Boolean(session.user.onboardedAt && session.user.username);
    redirect(done ? ROUTES.APP_HOME : ROUTES.ONBOARDING);
  }

  const stripeReady = isStripeReady();

  return (
    <PublicSurface
      navLinks={PUBLIC_NAV_LINKS}
      right={(
        <div className="flex items-center gap-2">
          <Link href={ROUTES.SIGN_IN} className="ui-public-nav-link hidden sm:block">
            Sign in
          </Link>
          <Link href={ROUTES.SIGN_IN} className="ui-public-primary-action-compact">
            Get started →
          </Link>
        </div>
      )}
    >
      <main className="relative z-10 flex flex-col items-center px-6 pb-16 pt-16 text-center sm:pb-32 sm:pt-28">

        <h1 className="ui-public-title max-w-5xl">
          {LANDING_HEADLINE[0]}
          <br />
          <span className="ui-public-title-muted">{LANDING_HEADLINE[1]}</span>
        </h1>

        <p className="ui-public-subtitle">
          {LANDING_SUBTITLE}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href={ROUTES.SIGN_IN} className="ui-public-primary-action">
            Get started →
          </Link>
          <Link href="/whitepaper" className="ui-public-nav-action px-8 py-3">
            {LANDING_WHITEPAPER_LABEL}
          </Link>
        </div>

        <div id="features" className="mt-16 sm:mt-32 w-full max-w-4xl scroll-mt-24">
          <p className="ui-public-section-kicker">What it does</p>
          <h2 className="ui-public-section-title-spaced">One surface. Every system.</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {LANDING_FEATURES.map(({ icon, title, body }) => (
              <div key={title} className="ui-public-feature-card">
                <div className="ui-public-feature-icon">{icon}</div>
                <div className="ui-public-feature-title">{title}</div>
                <p className="ui-public-feature-body">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="pricing" className="mt-16 sm:mt-32 w-full max-w-4xl scroll-mt-24">
          <p className="ui-public-section-kicker">Pricing</p>
          <h2 className="ui-public-section-title mb-2">Simple, honest pricing</h2>
          <p className="ui-public-section-note">Billed annually · cancel any time</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {LANDING_PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`ui-public-pricing-card${tier.highlighted ? " ui-public-pricing-card-highlighted" : ""}`}
              >
                {tier.highlighted && (
                  <div className="ui-public-pricing-popular">Most popular</div>
                )}
                <div className="ui-public-pricing-plan">{tier.name}</div>
                <div className="ui-public-pricing-price-row">
                  <span className="ui-public-pricing-price">${tier.monthly}</span>
                  <span className="ui-public-pricing-period">/mo</span>
                </div>
                <p className="ui-public-pricing-annual">${tier.annual}/yr billed annually</p>
                <p className="ui-public-pricing-tagline">{tier.tagline}</p>
                <Link
                  href={
                    stripeReady
                      ? `${ROUTES.SIGN_IN}?callbackUrl=${encodeURIComponent(`/api/checkout/${tier.name.toLowerCase()}`)}`
                      : ROUTES.SIGN_IN
                  }
                  className={
                    tier.highlighted
                      ? "ui-public-primary-action mb-6 block text-center"
                      : "ui-public-nav-action mb-6 block text-center"
                  }
                >
                  {tier.cta}
                </Link>
                <div className="ui-public-pricing-divider">
                  <ul className="ui-public-pricing-features">
                    {tier.features.map((feature) => (
                      <li key={feature} className="ui-public-pricing-feature">
                        <span className="ui-public-pricing-check">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="ui-public-footer mt-20">{LANDING_FOOTER}</p>
      </main>
    </PublicSurface>
  );
}
