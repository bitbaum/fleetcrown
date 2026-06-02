import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { DesktopDownload } from "@/components/public/DesktopDownload";
import { DESKTOP_DOWNLOAD } from "@/config/marketing-content";

export const metadata = {
  title: "Download — Cockpit Fleet Runner",
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
          git clone https://github.com/g-but/cockpit.git<br />
          cd cockpit/desktop<br />
          npm install<br />
          npm run dist:linux   # or dist:mac / dist:win on your machine
        </div>
        <p>
          Run the resulting <code>Cockpit Fleet Runner-*.AppImage</code> (make it executable with <code>chmod +x</code>) or install the .deb.
          It reads your existing <code>~/.config/agent-projects.conf</code>, shows your projects, and lets you dispatch intents that execute locally using the real orchestration logic (it will attempt to inject into a matching zellij session).
        </p>
        <p>
          In the app, paste an agent token from Cockpit Settings → Agent tokens to connect. 
          The web portal then becomes the remote control surface for the fleet running in this desktop app.
        </p>
        <p className="text-xs">
          Pre-built signed releases with auto-updates will become the default install path soon. This gets you a working native app right now.
        </p>
      </div>
    </PublicSurface>
  );
}
