import Link from "next/link";
import { Compass } from "lucide-react";
import { ROUTES } from "@/config/auth";

export default function NotFound() {
  return (
    <div className="ui-empty-page p-8">
      <div className="ui-card-shell-raised flex max-w-2xl flex-col items-center gap-5 px-8 py-10 text-center">
        <Compass className="h-14 w-14 text-text-muted" />
        <div className="text-2xl font-medium text-text-primary">Page not found</div>
        <div className="max-w-xl text-lg text-text-secondary">
          That route doesn&rsquo;t exist in Cockpit.
        </div>
        <Link
          href={ROUTES.APP_HOME}
          className="ui-btn-chip rounded-2xl px-5 py-3 text-base text-text-primary"
        >
          Back to Today
        </Link>
      </div>
    </div>
  );
}
