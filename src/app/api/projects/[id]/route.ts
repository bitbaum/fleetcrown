import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { readCronJobs } from "@/lib/crons";
import { patchProject, deleteProject, PatchProjectBody, resolveProjectDetailWithOrgFallback } from "@/db/queries/projects";
import { getProjectPromptActivity } from "@/db/queries/prompt-history";
import { getProjectOrchestrationRuns } from "@/db/queries/orchestration-runs";
import { getProjectStateByProjectId } from "@/db/queries/project-states";
import { getIntentLabel, getAdapterLabel } from "@/config/control-intents";

function getLinkedJobs(projectId: string, projectName: string) {
  const nameLower = projectName.toLowerCase();
  return readCronJobs()
    .filter((job) => {
      const byId = job.projectId === projectId;
      const jobNameLower = (job.name ?? "").toLowerCase();
      const msgLower = (job.payload?.message ?? "").toLowerCase();
      // Fallback: fuzzy name match when no projectId set on the job
      const byFuzzy = !job.projectId && (jobNameLower.includes(nameLower) || msgLower.includes(nameLower));
      return byId || byFuzzy;
    })
    .map((job) => ({
      id: job.id,
      name: job.name,
      message: job.payload?.message ?? "",
      enabled: job.enabled,
      schedule: job.schedule?.expr ?? "",
      lastStatus: job.state?.lastStatus,
      consecutiveErrors: job.state?.consecutiveErrors ?? 0,
      projectId: job.projectId,
    }));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const dataOrResp = await readJsonBody(req, PatchProjectBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const updated = await patchProject(userId, idOrResp, dataOrResp);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") {
      return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;

  const deleted = await deleteProject(userId, idOrResp);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const [resolved, promptActivity, orchestrationRuns] = await Promise.all([
    resolveProjectDetailWithOrgFallback(userId, id),
    getProjectPromptActivity(userId, id, 40).catch((e) => { console.error("[projects/[id]] promptActivity query failed:", e); return []; }),
    getProjectOrchestrationRuns(userId, id, 20).catch((e) => { console.error("[projects/[id]] orchestrationRuns query failed:", e); return []; }),
  ]);

  if (!resolved) return NextResponse.json(null, { status: 404 });
  const { detail, ownerId } = resolved;
  // Runtime state belongs to the project owner — fetch under their userId so org
  // peers viewing a shared project see the same row the owner's daemon writes.
  const runtimeState = await getProjectStateByProjectId(ownerId, id).catch(() => null);
  const { project, createdAt, attrs, relations, recentInteractions, linkedGoals, devLog } = detail;
  const readonly = ownerId !== userId;

  const linkedJobs = getLinkedJobs(project.id, project.name);
  const activity = [
    ...promptActivity.map((item) => ({
      id: `prompt:${item.id}`,
      kind: "user_prompt" as const,
      occurredAt: item.dispatchedAt,
      title: "Sent prompt",
      body: item.customPrompt ?? getIntentLabel(item.intent),
    })),
    ...orchestrationRuns.map((run) => ({
      id: `run:${run.id}`,
      kind: "orchestrated_run" as const,
      occurredAt: run.startedAt.toISOString(),
      title: `${getAdapterLabel(run.adapter)} · ${getIntentLabel(run.intent)}`,
      body: run.summary?.next || run.summary?.done || run.payload?.resultText || run.payload?.error || "",
      state: run.state,
      health: run.summary?.health,
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 50);

  return NextResponse.json({
    id: project.id,
    name: project.name,
    type: project.type,
    description: project.description,
    source: project.source,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : (createdAt ?? null),
    readonly: readonly || undefined,
    attrs,
    relations,
    interactions: recentInteractions,
    linkedJobs,
    linkedGoals,
    devLog: [...(devLog ?? [])].reverse().slice(0, 20),
    activity,
    runtimeState: runtimeState ? {
      tabName: runtimeState.tabName,
      readyAt: runtimeState.readyAt?.toISOString() ?? null,
      closingAt: runtimeState.closingAt?.toISOString() ?? null,
      closedAt: runtimeState.closedAt?.toISOString() ?? null,
      currentPromptLabel: runtimeState.currentPromptLabel,
      currentPromptStartedAt: runtimeState.currentPromptStartedAt?.toISOString() ?? null,
      sessionUpdatedAt: runtimeState.sessionUpdatedAt?.toISOString() ?? null,
    } : null,
  });
}
