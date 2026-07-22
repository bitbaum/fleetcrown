import type { Metadata } from "next";
import { AgentsCockpit } from "@/components/agents/AgentsCockpit";
import { PageTitle } from "@/components/ui/page-title";
import { requirePageUserId } from "@/lib/session";
import { getUserProjects } from "@/db/queries/user-projects";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
  const userId = await requirePageUserId();
  const projects = await getUserProjects(userId).catch(() => []);
  const roster = projects.map((p) => ({ name: p.name, description: p.description ?? "" }));

  return (
    <div className="app-page flex flex-col gap-3 md:gap-4">
      <div className="ui-page-header">
        <div>
          <PageTitle title="Agents" />
          <p className="ui-page-subtitle hidden sm:block">
            Your fleet at a glance — what every agent is doing, and how they coordinate.
          </p>
        </div>
      </div>
      <AgentsCockpit registeredProjects={roster} />
    </div>
  );
}
