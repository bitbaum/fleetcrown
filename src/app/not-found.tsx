import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="ui-panel-raised flex max-w-2xl flex-col items-center gap-5 px-8 py-10 text-center">
      <Compass className="h-14 w-14 text-text-muted" />
      <div className="text-2xl font-medium text-text-primary">Page not found</div>
      <div className="max-w-xl text-lg text-text-secondary">
        That route doesn&rsquo;t exist in Cockpit.
      </div>
      <Link
        href="/today"
        className="rounded-2xl border border-border-default bg-surface-overlay px-5 py-3 text-base text-text-primary transition-colors hover:bg-surface-raised"
      >
        Back to Today
      </Link>
      </div>
    </div>
  );
}
