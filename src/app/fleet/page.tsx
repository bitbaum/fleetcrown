import type { Metadata } from "next";
import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { FinalCta } from "@/components/public/FinalCta";
import { getSessionUserId } from "@/lib/session";
import { getUserProjects } from "@/db/queries/user-projects";
import { getSelfImprovementTarget } from "@/db/queries/frontier";
import { readAppsConf } from "@/lib/register/apps-conf";
import {
  buildFleetRegister,
  commerce,
  isClientSite,
  summarize,
  type RegisterRow,
} from "@/lib/register/build";
import { solonOrgSlugs } from "@/lib/register/solon";

export const metadata: Metadata = {
  title: "The fleet",
  description:
    "Every project the studio runs, and where each one exists: a site, a FleetCrown profile, an OrangeCat profile, a Solon organisation.",
};
export const dynamic = "force-dynamic";

/**
 * The register, rendered as a public page. Same join as /api/fleet/register —
 * this page calls the function, not the endpoint, so the two cannot disagree.
 *
 * Three groups, in the order a visitor cares: what is live, what is being
 * built, and what exists only as a profile so far. Within a group the rows
 * are alphabetical by slug, which is the repository name — the one name every
 * system agrees on.
 *
 * Each row is also a to-do list. A dimmed chip is a gap: a project with no
 * site can be provisioned from its FleetCrown page; one with no OrangeCat
 * profile has nowhere to be funded; one with no Solon organisation has no
 * governance. The register does not hide the gaps — it is where you find
 * them.
 */
export default async function FleetRegisterPage() {
  const owner = await getSelfImprovementTarget();
  const projects = owner ? await getUserProjects(owner.userId) : [];
  const solon = await solonOrgSlugs();
  const apps = readAppsConf();
  // What the studio charges is the studio's business. The register below is
  // public; the commercial read of it is rendered only to the owner, and the
  // numbers it needs never enter a row that a response body carries.
  const viewerIsOwner = !!owner && (await getSessionUserId()) === owner.userId;
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
    apps,
    solon.orgs,
  );
  const s = summarize(rows);

  const groups: { id: string; title: string; lede: string; rows: RegisterRow[] }[] = [
    {
      id: "live",
      title: "Live",
      lede: "A public address on the box, answering.",
      rows: rows.filter((r) => r.site?.status === "live"),
    },
    {
      id: "building",
      title: "Being built",
      lede: "Provisioned through FleetCrown — a day-zero page, or a prospect not yet verified.",
      rows: rows.filter((r) => r.site && r.site.status !== "live"),
    },
    {
      id: "profiles",
      title: "Profile only",
      lede: "A FleetCrown project without a hosted site yet. Each one is a site away.",
      rows: rows.filter((r) => !r.site),
    },
  ].filter((g) => g.rows.length > 0);

  const money = viewerIsOwner ? commerce(apps) : null;
  const gaps = {
    site: rows.filter((r) => !r.site).length,
    orangecat: rows.filter((r) => !r.orangecat).length,
    solon: solon.checked ? rows.filter((r) => !r.solon).length : null,
  };

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="ui-public-container-mid py-12 sm:py-24 lg:py-32">
        <div className="ui-public-eyebrow">The fleet</div>
        <h1 className="ui-public-page-title mt-3 sm:mt-4">Every project, and where it lives.</h1>
        <p className="ui-public-lede mt-4 max-w-2xl sm:mt-6">
          One row per project, joined live from the owners of each fact: the hosting register for
          sites, this database for FleetCrown profiles and their OrangeCat link, and Solon for
          organisations. Nothing here is a copy, and nothing here is hidden — a dimmed chip is a
          gap, and a gap is the next piece of work.
        </p>
        <div className="ui-public-surface-card-meta">
          <span className="ui-public-surface-card-meta-chip">{s.projects} projects</span>
          <span className="ui-public-surface-card-meta-chip">{s.sites} sites</span>
          <span className="ui-public-surface-card-meta-chip">{s.fleetcrown} FleetCrown</span>
          <span className="ui-public-surface-card-meta-chip">{s.orangecat} OrangeCat</span>
          <span className="ui-public-surface-card-meta-chip">
            {solon.checked ? `${s.solon} Solon` : "Solon unreachable"}
          </span>
        </div>
        {/* Proportion, not decoration: the widths are the group counts. */}
        <div
          className="ui-public-fleet-bar mt-6"
          role="img"
          aria-label={groups.map((g) => `${g.title}: ${g.rows.length}`).join(", ")}
        >
          {groups.map((g) => (
            <div
              key={g.id}
              className={`ui-public-fleet-bar-seg ui-public-fleet-bar-seg-${
                g.id === "live" ? "live" : g.id === "building" ? "building" : "rest"
              }`}
              style={{ width: `${(g.rows.length / Math.max(1, rows.length)) * 100}%` }}
            />
          ))}
        </div>

        <nav className="ui-public-jumpbar" aria-label="Fleet sections">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="ui-public-jumpbar-link">
              {g.title} · {g.rows.length}
            </a>
          ))}
          {money && (
            <a href="#money" className="ui-public-jumpbar-link">
              What it earns
            </a>
          )}
          <a href="#gaps" className="ui-public-jumpbar-link">
            What is missing
          </a>
        </nav>
      </div>

      <div className="ui-public-container-mid space-y-12 pb-14 sm:space-y-20 sm:pb-24">
        {groups.map((g) => (
          <section key={g.id} id={g.id} className="border-t border-border-subtle pt-10 sm:pt-16">
            <h2 className="ui-public-display-md">{g.title}</h2>
            <p className="ui-public-section-lede mt-3 sm:mt-4">{g.lede}</p>
            <ol className="ui-public-fleet-list mt-8 sm:mt-12">
              {g.rows.map((r) => (
                <Row key={r.slug} r={r} solonChecked={solon.checked} />
              ))}
            </ol>
          </section>
        ))}

        {/* The commercial read — owner only. It sits ABOVE the coverage gaps on
            purpose: a studio's first question about its own register is not
            "how many rows" but "which of these is a business". Every number is
            computed from apps.conf's own owner/plan/price columns, so it cannot
            be talked up. */}
        {money && (
          <section id="money" className="border-t border-border-subtle pt-10 sm:pt-16">
            <h2 className="ui-public-display-md">What it earns</h2>
            <p className="ui-public-section-lede mt-3 sm:mt-4">
              {money.engagements > 0 && money.paying === 0
                ? "Work shipped for other people, and what it is charged for. Right now that is nothing: every engagement is on favour terms. The sites are real; the invoices are the missing half."
                : "Work shipped for other people, and what it is charged for. Terms come from the hosting register, one line per site."}
            </p>
            <ul className="ui-public-fleet-stats mt-8">
              <li className="ui-public-fleet-stat">
                <span className="ui-public-fleet-stat-num-accent">{money.engagements}</span>
                <span className="ui-public-fleet-stat-label">
                  live engagements
                  {money.clients.length > 0 && <> — {money.clients.join(", ")}</>}
                </span>
              </li>
              <li className="ui-public-fleet-stat">
                <span className="ui-public-fleet-stat-num-accent">{money.paying}</span>
                <span className="ui-public-fleet-stat-label">
                  of them priced above zero. The rest are favours, recorded as such rather than left
                  blank
                </span>
              </li>
              <li className="ui-public-fleet-stat">
                <span className="ui-public-fleet-stat-num-accent">{money.pipeline}</span>
                <span className="ui-public-fleet-stat-label">
                  sites in the pipeline — prospects and unverified addresses, each one a
                  conversation that has not happened yet
                </span>
              </li>
            </ul>
          </section>
        )}

        <section id="gaps" className="border-t border-border-subtle pt-10 sm:pt-16">
          <h2 className="ui-public-display-md">What is missing</h2>
          <p className="ui-public-section-lede mt-3 sm:mt-4">
            The register is a to-do list read sideways. These are the counts that should fall.
          </p>
          <ul className="ui-public-fleet-stats mt-8">
            <li className="ui-public-fleet-stat">
              <span className="ui-public-fleet-stat-num">{gaps.site}</span>
              <span className="ui-public-fleet-stat-label">
                projects without a site — each one is a hosted provisioning away
              </span>
            </li>
            <li className="ui-public-fleet-stat">
              <span className="ui-public-fleet-stat-num">{gaps.orangecat}</span>
              <span className="ui-public-fleet-stat-label">
                without an OrangeCat profile — nowhere to be backed, funded or hired
              </span>
            </li>
            <li className="ui-public-fleet-stat">
              <span className="ui-public-fleet-stat-num">{gaps.solon ?? "?"}</span>
              <span className="ui-public-fleet-stat-label">
                without a Solon organisation — decisions with no recount
              </span>
            </li>
          </ul>
        </section>

        <section className="border-t border-border-subtle pt-10 sm:pt-16">
          <h2 className="ui-public-display-md">The same register, as data</h2>
          <p className="ui-public-section-lede mt-3 sm:mt-4">
            The bitbaum showcase and the footer of this site are rendered from it. Anything else can
            be too.
          </p>
          <Link href="/api/fleet/register" className="ui-public-link-standalone mt-4 text-sm">
            /api/fleet/register →
          </Link>
        </section>
      </div>

      <FinalCta />
    </PublicSurface>
  );
}

function Row({ r, solonChecked }: { r: RegisterRow; solonChecked: boolean }) {
  const projectHref = r.fleetcrown ? `/projects/${r.fleetcrown.id}` : null;
  return (
    <li className="ui-public-fleet-row">
      <div className="min-w-0">
        {projectHref ? (
          <Link href={projectHref} className="ui-public-fleet-name">
            {r.name ?? r.slug}
          </Link>
        ) : (
          <div className="ui-public-fleet-name">{r.name ?? r.slug}</div>
        )}
        {r.name && r.name !== r.slug && <div className="ui-public-fleet-slug">{r.slug}</div>}
      </div>
      <div className="min-w-0">
        {r.site ? (
          <>
            <a
              href={r.site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-public-fleet-site"
            >
              {r.site.host}
            </a>
            <div className="ui-public-fleet-slug">
              {r.site.kind} · {r.site.status}
              {isClientSite(r) && <> · for {r.site.owner}</>}
              {r.site.since !== "-" && <> · since {r.site.since}</>}
            </div>
          </>
        ) : projectHref ? (
          <Link href={projectHref} className="ui-public-fleet-none">
            no site — provision one →
          </Link>
        ) : (
          <span className="ui-public-fleet-none">no site</span>
        )}
      </div>
      <div className="ui-public-fleet-presence">
        <Presence label="FleetCrown" href={projectHref} />
        <Presence
          label="OrangeCat"
          href={r.orangecat ? `https://orangecat.ch/projects/${r.orangecat.projectId}` : null}
          external
        />
        <Presence
          label="Solon"
          href={r.solon ? `https://solon.orangecat.ch/orgs/${r.solon.slug}` : null}
          external
          unknown={!solonChecked}
        />
      </div>
    </li>
  );
}

/**
 * One chip per system. Present = a link to the profile; absent = the same chip
 * dimmed, so a row's shape stays constant and a missing profile reads as a
 * gap, not as nothing. Unknown (Solon unreachable) shows a question mark
 * rather than pretending to know.
 */
function Presence({
  label,
  href,
  external,
  unknown,
}: {
  label: string;
  href: string | null;
  external?: boolean;
  unknown?: boolean;
}) {
  if (!href) {
    return (
      <span
        className="ui-public-fleet-presence-off"
        title={unknown ? "could not check" : "not yet"}
      >
        {label}
        {unknown ? " ?" : ""}
      </span>
    );
  }
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ui-public-fleet-presence-on"
    >
      {label} ↗
    </a>
  ) : (
    <Link href={href} className="ui-public-fleet-presence-on">
      {label}
    </Link>
  );
}
