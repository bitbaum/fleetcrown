import Link from "next/link";
import { Cpu } from "lucide-react";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { DesktopDownload } from "@/components/public/DesktopDownload";
import { DESKTOP_DOWNLOAD } from "@/config/marketing-content";
import { isFleetRunnerRequest } from "@/lib/fleet-runner";
import { ROUTES } from "@/config/auth";

export const metadata = {
  title: "Download Fleet Runner",
  description: DESKTOP_DOWNLOAD.hero.lede,
};

export default async function DownloadPage() {
  // Reaching /download from inside the desktop app is circular — you already
  // have the runner. Show a "you're set" panel that points back into the app
  // instead of re-pitching the install.
  const insideRunner = await isFleetRunnerRequest();

  if (insideRunner) {
    return (
      <PublicSurface right={<PublicHeaderActions />}>
        <div className="mx-auto max-w-2xl px-6 py-32 text-center">
          <div className="ui-public-eyebrow flex items-center justify-center gap-2">
            <Cpu className="h-3.5 w-3.5" />
            Fleet Runner
          </div>
          <h1 className="ui-public-display-lg mt-4">You&apos;re already running Fleet Runner.</h1>
          <p className="ui-public-section-lede mx-auto mt-6 max-w-xl">
            This is the desktop app — there&apos;s nothing to download. Open Control to
            pair it and dispatch agents at your local repos.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href={ROUTES.APP_HOME} className="ui-public-cta">
              Open Control
            </Link>
            <Link href="/docs/quickstart" className="ui-public-cta-ghost">
              Quickstart
            </Link>
          </div>
        </div>
      </PublicSurface>
    );
  }

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
