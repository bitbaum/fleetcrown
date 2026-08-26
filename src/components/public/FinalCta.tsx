import Link from "next/link";
import { ROUTES } from "@/config/auth";
import { FINAL_CTA } from "@/config/marketing-content";

export function FinalCta() {
  return (
    <div className="ui-public-container ui-public-section border-t border-border-subtle text-center">
      <h2 className="ui-public-display-lg">{FINAL_CTA.title}</h2>
      <p className="ui-public-meta mx-auto mt-4 max-w-md sm:mt-6">{FINAL_CTA.note}</p>
      <div className="mt-7 sm:mt-10">
        {/* Full width on a phone: this is the last thing on the page and the
            only action on it, so it should be the width of the thumb's reach,
            not a centred pill the size of its own label. */}
        <Link href={ROUTES.SIGN_IN} className="ui-public-cta-lg w-full sm:w-auto">
          {FINAL_CTA.cta}
        </Link>
      </div>
    </div>
  );
}
