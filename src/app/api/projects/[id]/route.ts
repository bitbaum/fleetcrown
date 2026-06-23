import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { readCronJobs } from "@/lib/crons";
import { patchProject, deleteProject, PatchProjectBody, resolveProjectDetailWithOrgFallback } from "@/db/queries/projects";
import { getProjectActivity } from "@/db/queries/activity";
import { getProjectStateByProjectId } from "@/db/queries/project-states";

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

  const resolved = await resolveProjectDetailWithOrgFallback(userId, id);
  if (!resolved) return NextResponse.json(null, { status: 404 });
  const { detail, ownerId } = resolved;
  const { project, createdAt, attrs, relations, recentInteractions, linkedGoals, devLog } = detail;
  const readonly = ownerId !== userId;

  // Runtime state + activity both belong to the project owner — fetch under their
  // userId so org peers viewing a shared project see the same rows the owner's
  // runner writes. Activity is the unified read-model SSOT (prompts + run
  // outcomes + lifecycle, deduped) keyed by project name — the same source the
  // /control Activity panel uses, instead of a parallel bespoke assembly.
  const [runtimeState, activity] = await Promise.all([
    getProjectStateByProjectId(ownerId, id).catch(() => null),
    getProjectActivity(ownerId, project.name, { days: 90, limit: 50 }).catch((e) => {
      console.error("[projects/[id]] activity query failed:", e);
      return [];
    }),
  ]);

  const linkedJobs = getLinkedJobs(project.id, project.name);

  return NextResponse.json({
    id: project.id,
    name: project.name,
    type: project.type,
    description: project.description,
    gitUrl: project.gitUrl ?? null,
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
