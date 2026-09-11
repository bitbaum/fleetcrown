import type { Metadata } from "next";
import { getUserProjects } from "@/db/queries/user-projects";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { readAppsConf } from "@/lib/register/apps-conf";
import { buildFleetRegister, summarize, type RegisterRow } from "@/lib/register/build";
import { solonOrgSlugs } from "@/lib/register/solon";

export const metadata: Metadata = {
  title: "Fleet register",
  description:
    "Every project the studio runs, and where each one exists: a site, a FleetCrown profile, an OrangeCat profile, a Solon organisation.",
};
export const dynamic = "force-dynamic";

/**
 * The register, rendered. Same join as /api/fleet/register — this page calls
 * the function, not the endpoint, so the two cannot disagree.
 */
export default async function FleetRegisterPage() {
  const owner = await getSelfImprovementTarget();
  const projects = owner ? await getUserProjects(owner.userId) : [];
  const solon = await solonOrgSlugs();
  const rows = buildFleetRegister(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      hostedApp: p.hostedApp,
      gitUrl: p.gitUrl,
      liveUrl: p.liveUrl,
      orangecatProjectId: p.orangecatProjectId,
      solonOrgSlug: p.solonOrgSlug,
      isActive: p.isActive,
    })),
    readAppsConf(),
    solon.orgs,
  );
  const s = summarize(rows);

  return (
    <main className="mx-auto max-w-shell px-6 py-12">
      <h1 className="font-heading text-3xl font-semibold tracking-display">Fleet register</h1>
      <p className="mt-3 max-w-prose text-fg-secondary">
        One row per project, joined live from the owners of each fact: the hosting register for
        sites, this database for FleetCrown profiles and their OrangeCat link, and Solon for
        organisations. Nothing here is a copy.
      </p>
      <p className="mt-4 font-mono text-xs uppercase tracking-caps text-fg-muted">
        {s.projects} projects · {s.sites} sites · {s.fleetcrown} FleetCrown · {s.orangecat}{" "}
        OrangeCat · {solon.checked ? `${s.solon} Solon` : "Solon unreachable"}
      </p>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-xs uppercase tracking-caps text-fg-muted">
            <tr>
              <th className="py-2 pr-4">project</th>
              <th className="py-2 pr-4">site</th>
              <th className="py-2 pr-4">status</th>
              <th className="py-2 pr-4">FleetCrown</th>
              <th className="py-2 pr-4">OrangeCat</th>
              <th className="py-2 pr-4">Solon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.slug} r={r} solonChecked={solon.checked} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Row({ r, solonChecked }: { r: RegisterRow; solonChecked: boolean }) {
  return (
    <tr className="border-t border-border-subtle align-top">
      <td className="py-2 pr-4">
        <span className="font-mono">{r.slug}</span>
        {r.name !== r.slug && <span className="ml-2 text-fg-muted">{r.name}</span>}
      </td>
      <td className="py-2 pr-4">
        {r.site ? (
          <a href={r.site.url} className="underline decoration-border-subtle underline-offset-4">
            {r.site.host}
          </a>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-4 text-fg-secondary">{r.site?.status ?? ""}</td>
      <td className="py-2 pr-4">
        {r.fleetcrown ? (
          <a
            href={`/projects/${r.fleetcrown.id}`}
            className="underline decoration-border-subtle underline-offset-4"
          >
            profile
          </a>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        {r.orangecat ? (
          <a
            href={`https://orangecat.ch/projects/${r.orangecat.projectId}`}
            className="underline decoration-border-subtle underline-offset-4"
          >
            profile
          </a>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        {r.solon ? (
          <a
            href={`https://solon.orangecat.ch/orgs/${r.solon.slug}`}
            className="underline decoration-border-subtle underline-offset-4"
          >
            organisation
          </a>
        ) : (
          <span className="text-fg-muted">{solonChecked ? "—" : "?"}</span>
        )}
      </td>
    </tr>
  );
}
