import { PublicSurface } from "@/components/public/PublicSurface";
import { FinalCta } from "@/components/public/FinalCta";
import { INVESTORS, INVESTOR_DETAILS } from "@/config/marketing-content";

export const metadata = {
  title: "For Investors",
  description: INVESTORS.thesis,
};

export default function InvestorsPage() {
  return (
    <PublicSurface>
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
        <div className="ui-public-eyebrow">{INVESTORS.eyebrow}</div>
        <h1 className="ui-public-page-title mt-4">{INVESTORS.headline}</h1>
        <p className="ui-public-lede mt-8 max-w-3xl">{INVESTORS.thesis}</p>
      </div>

      <div className="border-t border-white/10 py-20">
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

      <div className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-4xl px-6 grid gap-x-16 gap-y-16 md:grid-cols-2">
          <div>
            <div className="ui-public-eyebrow">WHAT WE HAVE BUILT</div>
            <p className="ui-public-body-lg mt-6">{INVESTORS.built}</p>
          </div>
          <div>
            <div className="ui-public-eyebrow">TRACTION</div>
            <p className="ui-public-body-lg mt-6">{INVESTORS.traction}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="ui-public-eyebrow">THE ASK</div>
          <p className="ui-public-section-lede mt-6">{INVESTORS.ask}</p>

          <div className="mt-16 flex flex-col gap-2">
            <a href={`mailto:${INVESTOR_DETAILS.contact}`} className="ui-public-prose-strong text-lg underline-offset-4 hover:underline">
              {INVESTOR_DETAILS.contact}
            </a>
            <p className="ui-public-meta">{INVESTOR_DETAILS.deck}</p>
          </div>
        </div>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
