import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFleetMap } from "@/lib/register/load-map";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { fleetSurfaceHref } from "@/lib/fleet-context";

export const dynamic = "force-dynamic";
export default async function PublicProjectProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const map = await loadFleetMap();
  if (!map)
    return (
      <PublicSurface right={<PublicHeaderActions />}>
        <div className="ui-public-container-mid py-12">
          <h1 className="ui-public-page-title">Profiles temporarily unavailable</h1>
          <p>Please retry shortly.</p>
        </div>
      </PublicSurface>
    );
  const project = map.projects.find((p) => p.slug === slug);
  if (!project) notFound();
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-container-mid py-12 sm:py-20">
        <Link href="/fleet" className="ui-public-link">
          All projects
        </Link>
        <h1 className="ui-public-page-title mt-6">{project.name}</h1>
        <p className="ui-public-lede mt-4">
          {project.what ?? "Purpose has not been recorded yet."}
        </p>
        <p className="ui-public-meta mt-4">
          {project.status === "live" || project.status === "validating"
            ? "Beta — running, not released"
            : project.status}
        </p>
        <nav aria-label="Project context" className="ui-public-jumpbar">
          <a className="ui-public-jumpbar-link" href="#purpose">
            Purpose
          </a>
          <a className="ui-public-jumpbar-link" href="#technical">
            Technical context
          </a>
          <a className="ui-public-jumpbar-link" href="#roadmap">
            Roadmap
          </a>
          <a className="ui-public-jumpbar-link" href="#changelog">
            Changelog
          </a>
        </nav>
        <section id="purpose" className="mt-12 space-y-8">
          {Object.entries(project.identity).map(([key, value]) => (
            <div key={key}>
              <h2 className="ui-public-display-md capitalize">{key}</h2>
              <p className="ui-public-section-lede mt-3">{value ?? "Not recorded yet."}</p>
            </div>
          ))}
        </section>
        <section id="technical" className="mt-12">
          <h2 className="ui-public-display-md">Technical context</h2>
          <p className="ui-public-section-lede mt-3">
            {project.stack ?? "Stack not recorded yet."}
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            {Object.entries(project.urls)
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <a key={label} className="ui-public-link" href={url!}>
                  {label === "live"
                    ? "Product site"
                    : label === "repo"
                      ? "Source repository"
                      : label}
                </a>
              ))}
          </div>
          <Link href={fleetSurfaceHref("chat", project.slug)} className="ui-btn-chip mt-6">
            Investigate this project with Loki →
          </Link>
          <p className="ui-public-meta mt-3">
            Sign in to ask about architecture, evidence, delivery risks and next steps in your
            workspace.
          </p>
        </section>
        <section id="roadmap" className="mt-12">
          <h2 className="ui-public-display-md">Roadmap</h2>
          {project.roadmap.length === 0 ? (
            <p className="ui-public-section-lede mt-3">No roadmap items recorded yet.</p>
          ) : (
            <ol className="mt-6 space-y-6">
              {project.roadmap.map((item, i) => (
                <li key={`${item.title}-${i}`}>
                  <h3 className="ui-public-prose-strong">{item.title}</h3>
                  <p className="ui-public-meta">
                    {item.status ?? "Status not recorded"}
                    {item.progress !== null && ` · ${item.progress}% recorded progress`}
                    {item.targetDate && ` · target ${item.targetDate}`}
                  </p>
                  <ul>
                    {item.milestones.map((m) => (
                      <li className="ui-public-prose-muted" key={m}>
                        {m}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section id="changelog" className="mt-12">
          <h2 className="ui-public-display-md">Changelog</h2>
          {project.changelog.length === 0 ? (
            <p className="ui-public-section-lede mt-3">No changes recorded yet.</p>
          ) : (
            <ol className="mt-6 space-y-6">
              {project.changelog.map((item, i) => (
                <li key={`${item.date}-${i}`}>
                  <h3 className="ui-public-meta">{item.date}</h3>
                  <p className="ui-public-prose-muted whitespace-pre-wrap">{item.done}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <p className="ui-public-meta mt-12">
          Profile snapshot: {map.generatedAt}. Roadmap and changelog come from this project’s
          canonical development record.
        </p>
      </div>
    </PublicSurface>
  );
}
