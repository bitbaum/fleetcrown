import { PublicSurface } from "@/components/public/PublicSurface";
import { FinalCta } from "@/components/public/FinalCta";
import { ROADMAP } from "@/config/marketing-content";

export const metadata = {
  title: "Roadmap",
  description: ROADMAP.lede,
};

export default function RoadmapPage() {
  return (
    <PublicSurface>
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32">
        <div className="ui-public-eyebrow">{ROADMAP.eyebrow}</div>
        <h1 className="ui-public-page-title mt-4">{ROADMAP.title}</h1>
        <p className="ui-public-lede mt-6 max-w-2xl">{ROADMAP.lede}</p>
      </div>

      <div className="mx-auto max-w-4xl px-6 pb-24 space-y-24">
        {ROADMAP.phases.map((phase) => (
          <section key={phase.marker} className="border-t border-white/10 pt-16">
            <div className="ui-public-eyebrow">{phase.marker}</div>
            <h2 className="ui-public-display-md mt-4">{phase.title}</h2>
            <div className="ui-public-body-lg mt-10 max-w-2xl space-y-6">
              {phase.paragraphs.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          </section>
        ))}

        <p className="ui-public-meta border-t border-white/10 pt-12 max-w-2xl">{ROADMAP.closer}</p>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
