import { FolderKanban } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { getProjects } from "@/db/queries/projects";
import { GitHubStatus } from "@/components/projects/GitHubStatus";
import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { NewProjectButton } from "@/components/projects/NewProjectButton";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <PageLayout title="Projects" subtitle={`${projects.length} projects tracked`} right={<NewProjectButton />}>
      <GitHubStatus />
      <Card>
        <CardHeader icon={FolderKanban} title="All Projects" />
        <ProjectGrid projects={projects} />
      </Card>
    </PageLayout>
  );
}
