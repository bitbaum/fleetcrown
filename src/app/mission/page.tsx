import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { PUBLIC_NAV_LINKS } from "@/config/auth";
import { MISSION } from "@/config/marketing-content";

export const metadata = {
  title: "Mission",
  description: MISSION.statement,
};

export default function MissionPage() {
  return (
    <PublicSurface navLinks={PUBLIC_NAV_LINKS} right={<PublicHeaderActions />}>
      <div className="ui-public-hero-fold">
        <div className="ui-public-eyebrow">{MISSION.eyebrow}</div>
        <h1 className="ui-public-hero-title mt-6">{MISSION.title}</h1>
        <p className="ui-public-hero-lede mt-10 max-w-3xl">{MISSION.statement}</p>
      </div>

      <div className="border-t border-white/10 py-24">
        <div className="ui-public-body-lg mx-auto max-w-2xl space-y-8 px-6">
          {MISSION.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}
