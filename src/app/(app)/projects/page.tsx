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

export default async function ProjectsPage() {
  const userId = await requirePageUserId();
  const [ownProjects, orgProjects] = await Promise.all([
    getProjects(userId),
    getOrgEntityProjects(userId),
  ]);
  const projects: ProjectGridRow[] = [...ownProjects, ...orgProjects];

  return (
    <PullToRefresh>
      <PageLayout
        title="Projects"
        subtitle="Health, repos, and next steps across your fleet"
        right={<NewProjectButton />}
      >
        <Suspense fallback={<CardSkeleton />}>
          <ProjectsWorkspace projects={projects} />
        </Suspense>
        <AutoRefresh intervalMs={REFRESH_CADENCE.projects} />
      </PageLayout>
    </PullToRefresh>
  );
}
