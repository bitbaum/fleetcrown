import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { getProjectDossier } from "@/db/queries/project-dossier";
import { getActiveProjectShare } from "@/db/queries/project-shares";
import { PageLayout } from "@/components/ui/page-layout";
import { ProjectDossierView } from "@/components/projects/ProjectDossierView";
import { ProjectSharePanel } from "@/components/projects/ProjectSharePanel";
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

  const share = dossier.ownerId === session.user.id
    ? await getActiveProjectShare(session.user.id, id).catch(() => null)
    : null;
  const shareForClient = share ? {
    token: share.token,
    url: `/share/project/${share.token}`,
    audience: share.audience as "advisor" | "team" | "public",
    includeRoadmap: share.includeRoadmap,
    includeChangelog: share.includeChangelog,
    includeResources: share.includeResources,
    includeRepo: share.includeRepo,
    includeLiveUrl: share.includeLiveUrl,
  } : null;

  return (
    <PageLayout
      title="Project"
      subtitle="Living dossier for humans and agents"
      maxWidth="max-w-5xl"
      right={!dossier.readonly ? <ProjectSharePanel projectId={id} initialShare={shareForClient} /> : undefined}
    >
      <ProjectDossierView dossier={dossier} mode="private" />
    </PageLayout>
  );
}
