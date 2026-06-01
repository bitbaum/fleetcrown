import Link from "next/link";
import { ROUTES } from "@/config/auth";
import { FINAL_CTA } from "@/config/marketing-content";

export function FinalCta() {
  return (
    <div className="border-t border-white/10 py-24 text-center">
      <h2 className="ui-public-display-lg">{FINAL_CTA.title}</h2>
      <p className="ui-public-meta mx-auto mt-6 max-w-md">{FINAL_CTA.note}</p>
      <div className="mt-10">
        <Link href={ROUTES.SIGN_IN} className="ui-public-cta-lg">
          {FINAL_CTA.cta}
        </Link>
      </div>
    </div>
  );
}
