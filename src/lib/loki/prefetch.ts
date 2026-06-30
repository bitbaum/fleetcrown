import { listConversations } from "@/db/queries/conversations";
import { ensureUserProjectEntityLinks } from "@/db/queries/user-projects";
import { getTopActiveGoalByProject } from "@/db/queries/project-context";
import type { ConversationSummary, LokiProject } from "@/components/loki/types";

export type LokiWorkspaceSeed = {
  projects: LokiProject[];
  conversations: ConversationSummary[];
  projectsError: string | null;
  conversationsError: string | null;
};

function serializeConversations(
  rows: Awaited<ReturnType<typeof listConversations>>,
): ConversationSummary[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    projectKeys: r.projectKeys,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Server-side seed for /loki — projects + conversation list without client waterfalls. */
export async function prefetchLokiWorkspace(userId: string): Promise<LokiWorkspaceSeed> {
  const [projectsResult, conversationsResult] = await Promise.allSettled([
    (async () => {
      const projects = await ensureUserProjectEntityLinks(userId);
      const goalByEntity = await getTopActiveGoalByProject(userId);
      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        topGoal: p.entityProjectId ? goalByEntity.get(p.entityProjectId) ?? null : null,
      }));
    })(),
    listConversations(userId).then(serializeConversations),
  ]);

  return {
    projects: projectsResult.status === "fulfilled" ? projectsResult.value : [],
    conversations: conversationsResult.status === "fulfilled" ? conversationsResult.value : [],
    projectsError:
      projectsResult.status === "rejected" ? "Could not load projects." : null,
    conversationsError:
      conversationsResult.status === "rejected" ? "Could not load conversations." : null,
  };
}
