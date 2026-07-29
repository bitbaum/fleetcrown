import Link from "next/link";
import { FLEET_RUNNER_RELEASES, CURRENT_RELEASE, PLATFORM_CHANGELOG } from "@/config/changelog";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";

export const metadata = {
  title: "Changelog",
  description: "Fleet Runner changelog. Every shipped version, what changed, and why.",
};

const RELEASES_GH_BASE = "https://github.com/maonakamoto/fleetcrown-releases/releases/tag";

// Full month, uppercased in CSS — matches the x.ai changelog date style.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ReleasesPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-changelog-root">
      <div className="ui-changelog-page">
        <header>
          <div className="ui-changelog-eyebrow">Changelog</div>
          <h1 className="ui-changelog-title">FleetCrown</h1>
          <p className="ui-changelog-lede">
            What shipped, what changed, and why — platform milestones and every Fleet Runner
            version. The latest runner is{" "}
            <span className="ui-changelog-code">v{CURRENT_RELEASE.version}</span>, published{" "}
            {formatDate(CURRENT_RELEASE.date)}.
          </p>
          <div className="ui-changelog-foot">
            <Link href="/download" className="ui-changelog-link">
              Download latest →
            </Link>
            <a
              href="https://github.com/maonakamoto/fleetcrown-releases/releases"
              target="_blank"
              rel="noreferrer"
              className="ui-changelog-link"
            >
              GitHub releases →
            </a>
          </div>
        </header>

        {PLATFORM_CHANGELOG.length > 0 && (
          <div className="ui-changelog-feed">
            <h2 className="ui-changelog-title">Platform</h2>
            {PLATFORM_CHANGELOG.map((entry, idx) => (
              <article key={`${entry.date}-${entry.title}`} className="ui-changelog-entry">
                <div className="ui-changelog-meta">
                  <time className="ui-changelog-date" dateTime={entry.date}>
                    {formatDate(entry.date)}
                  </time>
                  {idx === 0 && <span className="ui-changelog-current">Latest</span>}
                </div>

                <h3 className="ui-changelog-entry-title">{entry.title}</h3>

                <ul className="ui-changelog-list">
                  {entry.highlights.map((line) => (
                    <li key={line} className="ui-changelog-item">
                      <span className="ui-changelog-bullet" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                {entry.link && (
                  <div className="ui-changelog-foot">
                    <Link href={entry.link.href} className="ui-changelog-link">
                      {entry.link.label} →
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="ui-changelog-feed">
          <h2 className="ui-changelog-title">Fleet Runner</h2>
          {FLEET_RUNNER_RELEASES.map((release, idx) => (
            <article key={release.tag} className="ui-changelog-entry">
              <div className="ui-changelog-meta">
                <time className="ui-changelog-date" dateTime={release.date}>
                  {formatDate(release.date)}
                </time>
                <span className="ui-changelog-version">v{release.version}</span>
                {idx === 0 && <span className="ui-changelog-current">Latest</span>}
              </div>

              <h2 className="ui-changelog-entry-title">Fleet Runner {release.version}</h2>

              {release.notes && <p className="ui-changelog-notes">{release.notes}</p>}

              {release.highlights.length > 0 && (
                <ul className="ui-changelog-list">
                  {release.highlights.map((line) => (
                    <li key={line} className="ui-changelog-item">
                      <span className="ui-changelog-bullet" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}

              {release.breaking.length > 0 && (
                <div className="ui-changelog-breaking">
                  <div className="ui-changelog-breaking-label">Breaking</div>
                  <ul className="ui-changelog-list">
                    {release.breaking.map((line) => (
                      <li key={line} className="ui-changelog-item">
                        <span className="ui-changelog-bullet" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="ui-changelog-foot">
                <a
                  href={`${RELEASES_GH_BASE}/${release.tag}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-changelog-link"
                >
                  Binaries →
                </a>
                <span className="ui-changelog-tag">{release.tag}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
      </div>
    </PublicSurface>
  );
}
