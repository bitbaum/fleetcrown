// SSOT for INTENTIONALLY dispatching a coding task to the hosted Hermes runner.
//
// inject-core auto-routes to Hermes only as a fallback (a WORK dispatch queued
// while the local Fleet Runner is offline). This is the deliberate path: the CLI
// (scripts/hermes-dispatch.ts), the API route (/api/hermes/dispatch → the
// Control "Run in cloud" button), and any future caller all funnel through here
// so project resolution, enqueue, and Activity attribution stay identical.
//
// It enqueues a BARE task; the consumer (scripts/hosted-runner.ts) is the single
// choke point that enriches every hosted dispatch with project context + recent
// activity before handing it to Hermes — so context lives in ONE place, not per
// trigger. See run-hermes.ts for the clone→Hermes→PR execution.

import { getUserProjects } from "@/db/queries/user-projects";
import { enqueueHostedDispatchCommand } from "@/db/queries/pending-commands";
import { createOrchestrationEventOnce } from "@/db/queries/orchestration-events";
import type { AdapterId } from "@/lib/orchestration";

const HERMES_ADAPTER = "hermes" as AdapterId;

export type HostedDispatchResult =
  | { ok: true; hostedDispatchId: string; projectKey: string; projectName: string; gitUrl: string }
  | { ok: false; status: number; error: string; knownProjects?: string[] };

/** Resolve a project by name (case-insensitive) or a `/key` fragment of its git URL. */
function findProject<T extends { name?: string | null; gitUrl?: string | null }>(
  projects: T[],
  projectKey: string,
): T | undefined {
  const key = projectKey.toLowerCase();
  return projects.find(
    (p) => p.name?.toLowerCase() === key || (p.gitUrl ?? "").toLowerCase().includes(`/${key}`),
  );
}

/**
 * Queue a coding task for the hosted runner. Never throws — resolution and
 * enqueue failures come back as a typed `{ ok: false }` so both the CLI and the
 * HTTP route can render them without a try/catch.
 */
export async function dispatchToHostedRunner(input: {
  userId: string;
  projectKey: string;
  task: string;
  model?: string;
}): Promise<HostedDispatchResult> {
  const { userId, projectKey, task, model } = input;
  const trimmedTask = task.trim();
  if (!projectKey.trim() || !trimmedTask) {
    return { ok: false, status: 400, error: "projectKey and a non-empty task are required." };
  }

  const projects = await getUserProjects(userId).catch(() => []);
  const project = findProject(projects, projectKey);
  if (!project) {
    return {
      ok: false,
      status: 404,
      error: `No project matching "${projectKey}".`,
      knownProjects: projects.map((p) => p.name).filter((n): n is string => !!n),
    };
  }
  if (!project.gitUrl) {
    return {
      ok: false,
      status: 422,
      error: `Project "${project.name}" has no git URL — set one (Projects → edit) so Hermes can clone it.`,
    };
  }

  let hostedDispatchId: string;
  try {
    hostedDispatchId = await enqueueHostedDispatchCommand(userId, {
      projectKey: project.name!,
      gitUrl: project.gitUrl,
      task: trimmedTask,
      ...(model ? { model } : {}),
    });
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "enqueue failed" };
  }

  // Make the dispatch visible in Activity immediately — before the timer drains
  // it — attributed to the real executor (Hermes). Deduped by command id so a
  // retry can't double-count. Telemetry must never fail the dispatch.
  void createOrchestrationEventOnce(
    {
      userId,
      projectKey: project.name!,
      eventType: "continue_requested",
      source: "hosted-runner",
      adapter: HERMES_ADAPTER,
      detail: `Dispatched to hosted runner (Hermes) — ${trimmedTask.slice(0, 120)}`,
      happenedAt: new Date(),
    },
    `hosted-dispatch:${hostedDispatchId}`,
  ).catch((e) => console.error("[hosted-dispatch] event emit failed:", e));

  return {
    ok: true,
    hostedDispatchId,
    projectKey: project.name!,
    projectName: project.name!,
    gitUrl: project.gitUrl,
  };
}
