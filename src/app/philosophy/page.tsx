import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { PHILOSOPHY } from "@/config/marketing-content";

export const metadata = {
  title: "Philosophy",
  description: PHILOSOPHY.lede,
};

export default function PhilosophyPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-container-mid py-12 sm:py-24 lg:py-32">
        <div className="ui-public-eyebrow">{PHILOSOPHY.eyebrow}</div>
        <h1 className="ui-public-page-title mt-3 sm:mt-4">{PHILOSOPHY.title}</h1>
        <p className="ui-public-lede mt-4 max-w-2xl sm:mt-6">{PHILOSOPHY.lede}</p>

        {/* The numbered rail becomes a numbered badge above each principle on a
            phone: a 32px gutter plus a 12px number left ~300px of measure for
            display type, so every principle name broke across three lines. */}
        <div className="mt-10 space-y-10 sm:mt-20 sm:space-y-16">
          {PHILOSOPHY.values.map((value, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:gap-12">
              <div className="ui-public-step-num sm:pt-2">{String(i + 1).padStart(2, "0")}</div>
              <div className="flex-1">
                <h2 className="ui-public-display-md">{value.name}</h2>
                <p className="ui-public-body-lg mt-3 max-w-2xl sm:mt-4">{value.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="ui-public-meta mt-12 max-w-2xl sm:mt-24">{PHILOSOPHY.closer}</p>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
