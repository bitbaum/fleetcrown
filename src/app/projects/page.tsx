import { FolderKanban, ExternalLink } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { getProjects } from "@/db/queries/projects";
import { GitHubStatus } from "@/components/projects/GitHubStatus";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <PageLayout title="Projects" subtitle={`${projects.length} projects tracked`}>
      <GitHubStatus />

      <Card>
        <CardHeader icon={FolderKanban} title="All Projects" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((project) => (
            <div key={project.id} className="rounded-md border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{project.name}</div>
                {project.attrs["production_url"] && (
                  <a
                    href={project.attrs["production_url"]}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/30 hover:text-white/60"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {project.description && (
                <div className="text-xs text-white/40 mt-1">{project.description}</div>
              )}
              {Object.keys(project.attrs).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(project.attrs)
                    .filter(([k]) => !k.startsWith("channel:") && k !== "production_url")
                    .slice(0, 3)
                    .map(([key, value]) => (
                      <span
                        key={key}
                        className="px-1.5 py-0.5 text-[10px] bg-white/5 rounded text-white/40"
                      >
                        {key}: {String(value).slice(0, 30)}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </PageLayout>
  );
}
