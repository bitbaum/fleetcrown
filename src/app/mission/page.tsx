import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { MISSION } from "@/config/marketing-content";

export const metadata = {
  title: "Mission",
  description: MISSION.statement,
};

export default function MissionPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-hero-fold ui-public-hero-fold-compact">
        <div className="w-full max-w-5xl">
          <div className="ui-public-eyebrow">{MISSION.eyebrow}</div>
          <h1 className="ui-public-hero-title mt-4 sm:mt-6">{MISSION.title}</h1>
          <p className="ui-public-hero-lede mt-6 max-w-3xl sm:mt-10">{MISSION.statement}</p>
        </div>
      </div>

      <div className="ui-public-section border-t border-border-subtle">
        <div className="ui-public-body-lg mx-auto max-w-2xl space-y-6 px-4 sm:space-y-8 sm:px-6">
          {MISSION.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
