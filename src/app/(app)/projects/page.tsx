import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { CardSkeleton } from "@/components/ui/card";
import { getProjects, getOrgEntityProjects } from "@/db/queries/projects";
import { ProjectsWorkspace } from "@/components/projects/ProjectsWorkspace";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
import type { ProjectGridRow } from "@/components/projects/ProjectGridCard";
import { requirePageUserId } from "@/lib/session";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { REFRESH_CADENCE } from "@/config/refresh";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; name?: string }>;
}) {
  const userId = await requirePageUserId();
  // Deep link from OrangeCat (and anywhere else): /projects?new=1&name=<prefill>
  // opens the create dialog immediately, optionally prefilled.
  const params = await searchParams;
  const autoOpenCreate = params.new === "1";
  const prefillName = typeof params.name === "string" ? params.name : undefined;
  const [ownProjects, orgProjects] = await Promise.all([
    getProjects(userId),
    getOrgEntityProjects(userId),
  ]);
  const projects: ProjectGridRow[] = [...ownProjects, ...orgProjects];

  return (
    <PullToRefresh>
      <PageLayout
        title="Projects"
        subtitle="Your project catalog — health, context & goals; needs-attention first"
        maxWidth="max-w-5xl"
        right={<NewProjectButton autoOpen={autoOpenCreate} initialName={prefillName} />}
      >
        <Suspense fallback={<CardSkeleton />}>
          <ProjectsWorkspace projects={projects} />
        </Suspense>
        <AutoRefresh intervalMs={REFRESH_CADENCE.projects} />
      </PageLayout>
    </PullToRefresh>
  );
}
