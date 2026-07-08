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
import { db } from "@/db";
import { entities } from "@/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { getProjectStateByProjectId } from "./project-states";
import { getProjectActivity, type ProjectActivityEvent } from "./activity";
import { getProjectOrchestrationRuns, getRecentOutcomes, type RecentOutcome } from "./orchestration-runs";
import { getUserProjectByEntityId } from "./user-projects";
import { getProjectShareByToken } from "./project-shares";
import type { UserProject } from "@/db/schema";
import type { orchestrationRuns } from "@/db/schema/orchestration-runs";
import type { ProjectShare } from "@/db/schema/project-shares";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { renderOperatingPrinciples } from "@/config/operating-principles";

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

export type SharedProjectDossier = {
  dossier: ProjectDossier;
  share: ProjectShare;
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

export async function getProjectDossierByOwner(
  ownerUserId: string,
  projectId: string,
): Promise<ProjectDossier | null> {
  const dossier = await getProjectDossier(ownerUserId, projectId);
  return dossier && dossier.ownerId === ownerUserId ? dossier : null;
}

export async function getProjectDossierByProjectKey(
  ownerUserId: string,
  projectKey: string,
): Promise<ProjectDossier | null> {
  const project = await db.query.entities.findFirst({
    where: and(eq(entities.userId, ownerUserId), eq(entities.type, ENTITY_TYPE.PROJECT), ilike(entities.name, projectKey)),
    columns: { id: true },
  });
  return project ? getProjectDossierByOwner(ownerUserId, project.id) : null;
}

export async function getSharedProjectDossier(token: string): Promise<SharedProjectDossier | null> {
  const share = await getProjectShareByToken(token);
  if (!share) return null;
  const dossier = await getProjectDossierByOwner(share.userId, share.projectId);
  return dossier ? { dossier, share } : null;
}

export function renderProjectDossierForAgent(dossier: ProjectDossier): string {
  const { detail, userProject, state } = dossier;
  const attrs = detail.attrs;
  const latest = [...(detail.devLog ?? [])].reverse()[0] ?? null;
  const resources = (detail.resources ?? [])
    .filter((r) => r.title?.trim() || r.url?.trim() || r.notes?.trim())
    .slice(0, 16);
  const goals = detail.linkedGoals.slice(0, 8);
  const recentRuns = dossier.runs.slice(0, 8);

  const lines: string[] = [
    renderOperatingPrinciples(),
    `# Project dossier: ${detail.project.name}`,
  ];

  const description = detail.project.description?.trim();
  if (description) lines.push(`Brief: ${description}`);

  const profile: Array<[string, string | undefined | null]> = [
    ["Mission", attrs.mission],
    ["Vision", attrs.vision],
    ["Customers", attrs.customers],
    ["Status", attrs.status],
    ["Maturity", attrs.maturity],
    ["Stack", attrs.stack ?? userProject?.stack],
    ["Architecture", attrs.architecture],
    ["Conventions", attrs.conventions],
    ["Definition of done", attrs.definition_of_done],
    ["Next owner step", attrs.next_step],
    ["Operator notes", userProject?.notes],
  ];
  const filledProfile = profile.filter(([, value]) => value?.trim()) as Array<[string, string]>;
  if (filledProfile.length > 0) {
    lines.push("## Profile");
    for (const [label, value] of filledProfile) lines.push(`- ${label}: ${value}`);
  }

  if (state) {
    lines.push("## Runtime");
    lines.push(`- Agent running: ${state.agentRunning ? "yes" : "no"}`);
    if (state.sessionStatus) lines.push(`- Session status: ${state.sessionStatus}`);
    if (state.currentPromptLabel) lines.push(`- Current prompt: ${state.currentPromptLabel}`);
    if (state.sessionUpdatedAt) lines.push(`- Last handoff: ${state.sessionUpdatedAt.toISOString()}`);
  }

  if (latest) {
    lines.push("## Latest handoff");
    if (latest.done) lines.push(`- Done: ${latest.done}`);
    if (latest.next) lines.push(`- Next: ${latest.next}`);
    if (latest.tests) lines.push(`- Tests: ${latest.tests}`);
    if (latest.todos) lines.push(`- TODOs: ${latest.todos}`);
    if (latest.health) lines.push(`- Health: ${latest.health}`);
  }

  if (goals.length > 0) {
    lines.push("## Active roadmap");
    for (const goal of goals) {
      const milestones = Array.isArray(goal.milestones)
        ? goal.milestones.filter((m) => !m.done).slice(0, 3).map((m) => m.title).join("; ")
        : "";
      lines.push(`- ${goal.title}${typeof goal.progress === "number" ? ` (${goal.progress}%)` : ""}${milestones ? ` — next: ${milestones}` : ""}`);
    }
  }

  if (resources.length > 0) {
    lines.push("## Resources");
    for (const r of resources) {
      if (r.kind === "credential" || r.sensitivity === "credential" || r.sensitivity === "secret") {
        lines.push(`- ${r.title} (${r.sensitivity ?? r.kind} reference; do not expose secret values)${r.notes ? ` — ${r.notes}` : ""}`);
      } else {
        const meta = [r.kind, r.visibility ?? "private", r.sensitivity ?? "normal", r.url, r.notes].filter(Boolean).join(" — ");
        lines.push(`- ${r.title}${meta ? ` (${meta})` : ""}`);
      }
    }
  }

  if (recentRuns.length > 0) {
    lines.push("## Recent run outcomes");
    for (const run of recentRuns) {
      lines.push(`- ${run.startedAt.toISOString()}: ${run.intent} — ${run.outcome ?? run.state}`);
    }
  }

  return lines.join("\n").slice(0, 9000);
}
