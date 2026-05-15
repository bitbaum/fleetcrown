import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserCount } from "@/db/queries/users";
import { PublicSurface } from "@/components/public/PublicSurface";
import {
  LANDING_BADGE,
  LANDING_FEATURES,
  LANDING_FOOTER,
  LANDING_HEADLINE,
  LANDING_PRICING,
  LANDING_SUBTITLE,
  LANDING_WHITEPAPER_LABEL,
} from "@/config/marketing";

export default async function LandingPage() {
  if ((await getUserCount()) === 0) redirect("/setup");

  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <PublicSurface
      right={(
        <Link
          href="/sign-in"
          className="ui-public-nav-action"
        >
          Sign in
        </Link>
      )}
    >
      <main
        className="relative z-10 flex flex-col items-center px-6 pb-28 pt-24 text-center"
      >
        <div className="ui-public-badge mb-12">
          <span className="h-1.5 w-1.5 rounded-full bg-status-positive" />
          {LANDING_BADGE}
        </div>

        <h1 className="ui-public-title">
          {LANDING_HEADLINE[0]}
          <br />
          <span className="ui-public-title-muted">{LANDING_HEADLINE[1]}</span>
        </h1>

        <p className="ui-public-subtitle">
          {LANDING_SUBTITLE}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-in"
            className="ui-public-primary-action"
          >
            Get started →
          </Link>
          <Link
            href="/whitepaper"
            className="ui-public-nav-action px-8 py-3"
          >
            {LANDING_WHITEPAPER_LABEL}
          </Link>
        </div>

        <div className="mt-24 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {LANDING_FEATURES.map(({ icon, title, body }) => (
            <div
              key={title}
              className="ui-public-feature-card"
            >
              <div className="ui-public-feature-icon">{icon}</div>
              <div className="ui-public-feature-title">{title}</div>
              <p className="ui-public-feature-body">{body}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mt-28 w-full max-w-4xl">
          <div className="mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-white/90">
              Simple, honest pricing
            </h2>
            <p className="mt-2 text-sm text-white/30">
              Billed annually · cancel any time
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {LANDING_PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`ui-public-pricing-card${tier.highlighted ? " ui-public-pricing-card-highlighted" : ""}`}
              >
                {tier.highlighted && (
                  <div className="mb-4 inline-flex items-center rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                    Most popular
                  </div>
                )}
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/30">
                  {tier.name}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-white/90">
                    ${tier.monthly}
                  </span>
                  <span className="text-sm text-white/30">/mo</span>
                </div>
                <p className="mb-1 text-xs text-white/40">
                  ${tier.annual}/yr billed annually
                </p>
                <p className="mb-6 mt-3 text-sm leading-relaxed text-white/40">
                  {tier.tagline}
                </p>
                <Link
                  href="/sign-in"
                  className={
                    tier.highlighted
                      ? "ui-public-primary-action mb-6 block text-center"
                      : "ui-public-nav-action mb-6 block text-center"
                  }
                >
                  {tier.cta}
                </Link>
                <div className="border-t border-white/[0.06] pt-5">
                  <ul className="space-y-2.5 text-left">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-white/40">
                        <span className="mt-0.5 shrink-0 text-white/20">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="ui-public-footer">
          {LANDING_FOOTER}
        </p>
      </main>
    </PublicSurface>
  );
}
