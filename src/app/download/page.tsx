import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { DesktopDownload } from "@/components/public/DesktopDownload";
import { DESKTOP_DOWNLOAD } from "@/config/marketing-content";

export const metadata = {
  title: "Download Fleet Runner — FleetCrown",
  description: DESKTOP_DOWNLOAD.hero.lede,
};

export default function DownloadPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <DesktopDownload />

      <div className="mx-auto max-w-3xl px-6 pb-20 pt-4 text-center ui-public-meta">
        <Link href="/" className="ui-public-link text-sm">
          ← Back to homepage
        </Link>
        <span className="mx-3 text-border-strong">·</span>
        <Link href="/sign-in" className="ui-public-link text-sm">
          Sign in to the web app
        </Link>
      </div>
    </PublicSurface>
  );
}
