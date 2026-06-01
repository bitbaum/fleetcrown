import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { PUBLIC_NAV_LINKS } from "@/config/auth";
import { PHILOSOPHY } from "@/config/marketing-content";

export const metadata = {
  title: "Philosophy",
  description: PHILOSOPHY.lede,
};

export default function PhilosophyPage() {
  return (
    <PublicSurface navLinks={PUBLIC_NAV_LINKS} right={<PublicHeaderActions />}>
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
        <div className="ui-public-eyebrow">{PHILOSOPHY.eyebrow}</div>
        <h1 className="ui-public-page-title mt-4">{PHILOSOPHY.title}</h1>
        <p className="ui-public-lede mt-6 max-w-2xl">{PHILOSOPHY.lede}</p>

        <div className="mt-20 space-y-16">
          {PHILOSOPHY.values.map((value, i) => (
            <div key={i} className="flex gap-8 sm:gap-12">
              <div className="ui-public-step-num pt-2">{String(i + 1).padStart(2, "0")}</div>
              <div className="flex-1">
                <h2 className="ui-public-display-md">{value.name}</h2>
                <p className="ui-public-body-lg mt-4 max-w-2xl">{value.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="ui-public-meta mt-24 max-w-2xl">{PHILOSOPHY.closer}</p>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
