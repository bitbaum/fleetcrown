import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { INVESTORS, INVESTOR_DETAILS } from "@/config/marketing-content";
import { getDefaultUser } from "@/db/queries/users";
import { getHeroFleetSnapshot, type HeroFleetSnapshot } from "@/db/queries/public-fleet";

export const metadata = {
  title: "For Investors",
  description: INVESTORS.thesis,
};

export default async function InvestorsPage() {
  // Same real data source as the homepage hero — the founder's actual fleet,
  // public-safe fields only. Degrades to nothing rather than fake numbers.
  const owner = await getDefaultUser().catch(() => null);
  const fleet: HeroFleetSnapshot = owner
    ? await getHeroFleetSnapshot(owner.id).catch(() => ({ isLive: false, projects: [], metrics: [] }))
    : { isLive: false, projects: [], metrics: [] };

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
        <div className="ui-public-eyebrow">{INVESTORS.eyebrow}</div>
        <h1 className="ui-public-page-title mt-4">{INVESTORS.headline}</h1>
        <p className="ui-public-lede mt-8 max-w-3xl">{INVESTORS.thesis}</p>
      </div>

      <div className="border-t border-border-subtle py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="ui-public-eyebrow">WHY NOW</div>
          <div className="mt-10 space-y-10">
            {INVESTORS.whyNow.map((point, i) => (
              <div key={i} className="flex gap-8">
                <div className="ui-public-step-num pt-2">{String(i + 1).padStart(2, "0")}</div>
                <p className="ui-public-body-lg max-w-2xl">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border-subtle py-20">
        <div className="mx-auto max-w-4xl px-6 grid gap-x-16 gap-y-16 md:grid-cols-2">
          <div>
            <div className="ui-public-eyebrow">WHAT WE HAVE BUILT</div>
            <p className="ui-public-body-lg mt-6">{INVESTORS.built}</p>
          </div>
          <div>
            <div className="ui-public-eyebrow">TRACTION</div>
            {fleet.metrics.length > 0 && (
              <div className="mt-6 grid grid-cols-3 gap-6">
                {fleet.metrics.map((metric) => (
                  <div key={metric.label}>
                    <div className="ui-public-display-md">{metric.value}</div>
                    <div className="ui-public-meta mt-1">{metric.label}</div>
                  </div>
                ))}
              </div>
            )}
            <ul className="mt-6 space-y-4">
              {INVESTORS.traction.map((point, i) => (
                <li key={i} className="ui-public-prose-li">
                  <span className="ui-public-prose-bullet" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border-subtle py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="ui-public-eyebrow">THE ASK</div>
          <p className="ui-public-section-lede mt-6">{INVESTORS.ask}</p>
        </div>
      </div>

      {/* Investor-specific closing CTA — a "Begin." sign-up pitch is the wrong
          ask for this audience; the next step here is a conversation. */}
      <div className="border-t border-border-subtle py-24 text-center">
        <h2 className="ui-public-display-lg">Talk to the founder.</h2>
        <p className="ui-public-meta mx-auto mt-6 max-w-md">Deck {INVESTOR_DETAILS.deck.toLowerCase()}.</p>
        <div className="mt-10">
          <a href={`mailto:${INVESTOR_DETAILS.contact}`} className="ui-public-cta-lg">
            {INVESTOR_DETAILS.contact}
          </a>
        </div>
      </div>
    </PublicSurface>
  );
}
