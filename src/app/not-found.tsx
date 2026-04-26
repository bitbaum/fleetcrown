import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-white/50 gap-4 p-8">
      <Compass className="h-12 w-12 text-white/30" />
      <div className="text-lg font-semibold">Page not found</div>
      <div className="text-sm text-white/30 max-w-md text-center">
        That route doesn&rsquo;t exist in Cockpit.
      </div>
      <Link
        href="/today"
        className="mt-2 px-4 py-2 text-sm rounded-md border border-white/10 hover:bg-white/5 transition-colors"
      >
        Back to Today
      </Link>
    </div>
  );
}
