import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getProjectDossier } from "@/db/queries/project-dossier";
import { PageLayout } from "@/components/ui/page-layout";
import { OutcomeStreak } from "@/components/control/OutcomeStreak";
import { DoneSection, NowSection, NextSection } from "@/components/projects/ProjectDossierSections";
import { getProjectLinks } from "@/components/projects/project-detail-types";
import { cleanDescription } from "@/lib/project-display";
import { ROUTES } from "@/config/auth";

export const metadata = { title: "Project" };

/**
 * The full project page — the captain's dossier for one project, and the
 * refactor target for the old right-side drawer (which stays reachable as
 * the quick-edit surface via /projects?open=). Server-rendered from the
 * getProjectDossier SSOT assembly: Done (changelog + runs), Now (live
 * state + brief), Next (resume state + goals).
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect(ROUTES.SIGN_IN);

  const { id } = await params;
  const dossier = await getProjectDossier(session.user.id, id).catch(() => null);
  if (!dossier) notFound();

  const { detail, userProject, outcomes } = dossier;
  const attrs = detail.attrs;
  const name = detail.project.name;
  const links = getProjectLinks(attrs, userProject?.gitUrl ?? undefined);
  const rawDescription = cleanDescription(detail.project.description) ?? attrs.description ?? null;
  // Some project descriptions are full technical briefs (1000+ words, written
  // for agent context) — the header wants the gist, the full text stays in the
  // brief attrs and Quick edit. First sentence-ish, hard-capped.
  const description = rawDescription && rawDescription.length > 220
    ? `${rawDescription.slice(0, rawDescription.lastIndexOf(" ", 220))}…`
    : rawDescription;
  const orangecatUrl = userProject?.orangecatProjectId
    ? `https://orangecat.ch/projects/${userProject.orangecatProjectId}`
    : null;

  return (
    <PageLayout
      title={name}
      subtitle={description ?? undefined}
      maxWidth="max-w-5xl"
      right={
        <Link href={`/projects?open=${detail.project.id}`} className="ui-btn-secondary">
          Quick edit
        </Link>
      }
    >
      {/* Identity strip: state chips + streak + outbound links. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {attrs.status && <span className="ui-tag ui-tag-neutral">{attrs.status}</span>}
        {attrs.maturity && <span className="ui-tag ui-tag-neutral">{attrs.maturity}</span>}
        {outcomes.length > 0 && (
          <OutcomeStreak outcomes={outcomes.map((o) => o.outcome)} projectKey={name} />
        )}
        <span className="flex flex-wrap items-center gap-x-3 text-xs">
          {links.repo && (
            <a href={links.repo} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-2 hover:underline">
              Repository
            </a>
          )}
          {links.prodUrl && (
            <a href={links.prodUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-2 hover:underline">
              Live site
            </a>
          )}
          {orangecatUrl && (
            <a href={orangecatUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-2 hover:underline">
              OrangeCat
            </a>
          )}
          <Link href="/control" className="text-accent-text underline-offset-2 hover:underline">
            Control
          </Link>
        </span>
      </div>

      {/* Now / Next side-by-side on desktop; Done gets the full width below. */}
      <div className="grid gap-5 md:grid-cols-2">
        <NowSection dossier={dossier} />
        <NextSection dossier={dossier} />
      </div>
      <DoneSection dossier={dossier} />
    </PageLayout>
  );
}
