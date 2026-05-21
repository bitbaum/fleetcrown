import { Suspense } from "react";
import { FolderKanban } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { getProjects, getOrgEntityProjects } from "@/db/queries/projects";
import { GitHubStatus } from "@/components/projects/GitHubStatus";
import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
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
  const projects = [...ownProjects, ...orgProjects];

  return (
    <PullToRefresh>
      <PageLayout title="Projects" subtitle={`${projects.length} projects tracked`} right={<NewProjectButton />}>
        <GitHubStatus />
        <Card>
          <CardHeader icon={FolderKanban} title="All Projects" />
          <Suspense>
            <ProjectGrid projects={projects} />
          </Suspense>
        </Card>
        <AutoRefresh intervalMs={REFRESH_CADENCE.projects} />
      </PageLayout>
    </PullToRefresh>
  );
}
