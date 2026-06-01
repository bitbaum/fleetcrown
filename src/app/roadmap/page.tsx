import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { PUBLIC_NAV_LINKS } from "@/config/auth";
import { ROADMAP } from "@/config/marketing-content";

export const metadata = {
  title: "Roadmap",
  description: ROADMAP.lede,
};

export default function RoadmapPage() {
  return (
    <PublicSurface navLinks={PUBLIC_NAV_LINKS} right={<PublicHeaderActions />}>
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
            <p className="ui-public-section-lede mt-6">{phase.summary}</p>

            <ul className="mt-10 max-w-2xl space-y-4">
              {phase.bullets.map((bullet, j) => (
                <li key={j} className="ui-public-prose-li">
                  <span className="ui-public-prose-bullet" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {"note" in phase && phase.note ? (
              <p className="ui-public-meta mt-10 max-w-2xl italic">{phase.note}</p>
            ) : null}
          </section>
        ))}
      </div>

      <div className="border-t border-white/10 py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="ui-public-eyebrow">{ROADMAP.throughlines.eyebrow}</div>
          <h2 className="ui-public-display-md mt-4">{ROADMAP.throughlines.title}</h2>
          <p className="ui-public-section-lede mt-6">{ROADMAP.throughlines.lede}</p>

          <div className="mt-16 grid gap-12 md:grid-cols-2">
            {ROADMAP.throughlines.items.map((item, i) => (
              <div key={i} className="flex gap-6">
                <div className="ui-public-step-num pt-2">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="ui-public-prose-strong text-lg">{item.title}</div>
                  <p className="ui-public-body-lg mt-3">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 pb-24">
        <p className="ui-public-meta border-t border-white/10 pt-12 max-w-2xl">{ROADMAP.closer}</p>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
