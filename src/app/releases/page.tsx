import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FLEET_RUNNER_RELEASES, CURRENT_RELEASE } from "@/config/changelog";

export const metadata = {
  title: "Releases — FleetCrown",
  description: "Fleet Runner release history, version numbers, and changelog. Every shipped update is here.",
};

const RELEASES_GH_BASE = "https://github.com/maonakamoto/fleetcrown-releases/releases/tag";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ReleasesPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <header className="mb-12">
          <div className="ui-public-badge mb-4">Changelog</div>
          <h1 className="ui-public-title">Fleet Runner releases</h1>
          <p className="ui-public-lede mt-4 max-w-2xl">
            Every version of Fleet Runner that ever shipped, what changed, and why. The newest
            release is{" "}
            <span className="font-mono text-white">v{CURRENT_RELEASE.version}</span>
            {" "}— published {formatDate(CURRENT_RELEASE.date)}.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
            <Link href="/download" className="ui-public-link">
              Download latest →
            </Link>
            <a
              href="https://github.com/maonakamoto/fleetcrown-releases/releases"
              target="_blank"
              rel="noreferrer"
              className="ui-public-link"
            >
              Raw GitHub releases →
            </a>
          </div>
        </header>

        <div className="space-y-12">
          {FLEET_RUNNER_RELEASES.map((release, idx) => (
            <article key={release.tag} className="ui-public-release-entry">
              <header className="ui-public-release-divider mb-4 flex flex-wrap items-baseline justify-between gap-3 pb-3">
                <div className="flex items-baseline gap-3">
                  <span className="ui-public-release-version">v{release.version}</span>
                  {idx === 0 && (
                    <span className="ui-public-badge ui-public-badge-current">Current</span>
                  )}
                </div>
                <time className="ui-public-release-date" dateTime={release.date}>
                  {formatDate(release.date)}
                </time>
              </header>

              {release.notes && (
                <p className="ui-public-release-notes">{release.notes}</p>
              )}

              {release.highlights.length > 0 && (
                <>
                  <h3 className="ui-public-release-section-heading">What changed</h3>
                  <ul className="ui-public-release-list">
                    {release.highlights.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}

              {release.breaking.length > 0 && (
                <>
                  <h3 className="ui-public-release-section-heading ui-public-release-section-heading-breaking">
                    Breaking
                  </h3>
                  <ul className="ui-public-release-list">
                    {release.breaking.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-5 flex flex-wrap gap-4 text-xs">
                <a
                  href={`${RELEASES_GH_BASE}/${release.tag}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-public-link"
                >
                  Binaries on GitHub →
                </a>
                <span className="ui-public-release-tag">{release.tag}</span>
              </div>
            </article>
          ))}
        </div>

        <footer className="ui-public-release-footer">
          <p>
            Older releases (pre-v0.4.4) are available on{" "}
            <a
              href="https://github.com/maonakamoto/fleetcrown-releases/releases"
              target="_blank"
              rel="noreferrer"
              className="ui-public-link"
            >
              GitHub
            </a>
            . Release notes here are curated for clarity; the GitHub release pages contain the
            raw commit history. The desktop app auto-updates on launch when a newer version is
            available, except for .deb installs on Linux which require a manual{" "}
            <code className="ui-public-release-code">sudo dpkg -i</code> (Linux package
            policy — Electron can&apos;t escalate sudo from userspace).
          </p>
        </footer>
      </div>
    </PublicSurface>
  );
}
