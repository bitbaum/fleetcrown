import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { DesktopDownload } from "@/components/public/DesktopDownload";
import { DESKTOP_DOWNLOAD } from "@/config/marketing-content";

export const metadata = {
  title: "Download — Fleet Runner",
  description: DESKTOP_DOWNLOAD.lede,
};

export default function DownloadPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <div className="text-center">
          <div className="ui-public-eyebrow">{DESKTOP_DOWNLOAD.eyebrow}</div>
          <h1 className="ui-public-page-title mt-4">{DESKTOP_DOWNLOAD.title}</h1>
          <p className="ui-public-lede mt-4 max-w-2xl mx-auto">{DESKTOP_DOWNLOAD.lede}</p>
        </div>
      </div>

      <DesktopDownload />

      <div className="mx-auto max-w-3xl px-6 pb-24 ui-public-meta space-y-4">
        <p>
          The Fleet Runner is the native desktop app that owns execution on your machine. 
          Build it from the source repo (the packaged AppImage and .deb are produced in <code>desktop/dist/</code> after the commands below).
        </p>
        <div className="bg-surface-raised border border-border-subtle rounded-xl p-6 font-mono text-sm">
          {DESKTOP_DOWNLOAD.buildFromSource.steps.split(" && ").map((part, i, arr) => (
            <span key={i}>{part}{i < arr.length - 1 ? <br /> : null}</span>
          ))}
        </div>
        <p>
          Run the resulting <code>Fleet Runner-*.AppImage</code> (make it executable with <code>chmod +x</code>) or install the .deb.
          It reads your existing <code>~/.config/agent-projects.conf</code>, shows your projects, and lets you dispatch intents that execute locally using the real orchestration logic (it will attempt to inject into a matching zellij session).
        </p>
        <p>
          In the app, paste an agent token from FleetCrown Settings → Agent tokens to connect. 
          Then use the SYNC TO WEB button (in the RUNTIME section) to push your local projects/state so the hosted control plane sees this desktop app as your active local runner.
          Dispatch from the web or the desktop app will drive your local Zellij sessions.
        </p>

        {/* Explicit future platform promises per user request + first principles (honest, forward-looking, serves the builder) */}
        <div className="mt-8 pt-6 border-t border-border-subtle">
          <div className="ui-public-eyebrow mb-2">FUTURE DOWNLOADABLE APPS</div>
          <p className="text-sm text-text-secondary mb-3">
            We are building first-class downloadable experiences for the platforms builders actually live on:
          </p>
          <ul className="text-sm space-y-1 list-disc pl-5 text-text-secondary">
            <li><strong>Desktop</strong>: Signed, one-click installers with auto-update for macOS, Windows, and Linux (App Store, winget, apt, etc. where appropriate). The build-from-source path above gets you the real thing today.</li>
            <li><strong>Mobile</strong>: Native iOS and Android apps on the same remote control channel — fleet visibility, queues, dispatch, and oversight from your phone or tablet.</li>
            <li><strong>More</strong>: Additional runtimes, headless variants, and form factors as the local execution story matures.</li>
          </ul>
          <p className="text-xs mt-3">
            The web control plane (this site + your projects) is available right now — no install required.
          </p>
        </div>

        <p className="text-xs">
          Pre-built signed releases with auto-updates will become the default install path soon. This gets you a working native app right now.
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-16 text-center">
        <Link href="/" className="ui-public-link text-sm">Access the web version now →</Link>
        <span className="mx-2 text-border-strong">·</span>
        <Link href="/sign-in" className="ui-public-link text-sm">Sign in to the control plane</Link>
      </div>
    </PublicSurface>
  );
}
