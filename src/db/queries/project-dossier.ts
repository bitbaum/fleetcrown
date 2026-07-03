/**
 * Project dossier — the SSOT assembly behind the full project page
 * (/projects/[id]): everything a captain (or an agent) needs to answer
 * "what happened, where are we, what's next" for one project, composed
 * entirely from EXISTING sources of truth. No new tables, no parallel state:
 *
 *   Done — user_projects.devLog (the changelog) + orchestration_runs
 *          (outcomes, commits, durations)
 *   Now  — project_states (live runner state) + entity attributes
 *          (mission/status/brief) via getProjectDetail
 *   Next — latest handoff `next:` + linked goals + attrs.next_step
 *
 * Deliberately deterministic — no vector retrieval. pgvector earns its keep
 * for similarity ACROSS projects (fleet-RAG, already injected into
 * dispatches); a single project's dossier is a few KB and must be exact,
 * not similar. getProjectContext (the agent-facing text projection) should
 * converge onto this assembly so the page a human reads and the context an
 * agent receives can never disagree.
 */
import { resolveProjectDetailWithOrgFallback, type ProjectDetail } from "./projects";
import { getProjectStateByProjectId } from "./project-states";
import { getProjectActivity, type ProjectActivityEvent } from "./activity";
import { getProjectOrchestrationRuns, getRecentOutcomes, type RecentOutcome } from "./orchestration-runs";
import { getUserProjectByEntityId } from "./user-projects";
import type { UserProject } from "@/db/schema";
import type { orchestrationRuns } from "@/db/schema/orchestration-runs";

export type ProjectRunRow = typeof orchestrationRuns.$inferSelect;

export type ProjectDossier = {
  detail: ProjectDetail;
  ownerId: string;
  /** Viewer is an org peer, not the owner — page renders read-only. */
  readonly: boolean;
  state: Awaited<ReturnType<typeof getProjectStateByProjectId>> | null;
  activity: ProjectActivityEvent[];
  runs: ProjectRunRow[];
  outcomes: RecentOutcome[];
  /** The runtime row (devLog lives on detail; this adds gitUrl/dirPath/OC link). */
  userProject: UserProject | null;
};

export async function getProjectDossier(
  viewerUserId: string,
  projectId: string,
): Promise<ProjectDossier | null> {
  const resolved = await resolveProjectDetailWithOrgFallback(viewerUserId, projectId);
  if (!resolved) return null;
  const { detail, ownerId } = resolved;
  const projectKey = detail.project.name;

  const [state, activity, runs, outcomes, userProject] = await Promise.all([
    getProjectStateByProjectId(ownerId, projectId).catch(() => null),
    getProjectActivity(ownerId, projectKey, { days: 90, limit: 60 }).catch(() => []),
    getProjectOrchestrationRuns(ownerId, projectId, 25).catch(() => []),
    getRecentOutcomes(ownerId, projectKey, { limit: 10 }).catch(() => []),
    getUserProjectByEntityId(ownerId, projectId).catch(() => null),
  ]);

  return {
    detail,
    ownerId,
    readonly: ownerId !== viewerUserId,
    state,
    activity,
    runs,
    outcomes,
    userProject,
  };
}
