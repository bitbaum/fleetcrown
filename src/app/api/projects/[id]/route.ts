import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { db } from "@/db";
import { entities, entityRelations, interactions, goals, userProjects } from "@/db/schema";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";
import { fetchAttributesByEntityIds } from "@/db/queries/utils";
import { readIdParam, readJsonBody } from "@/lib/api/route-helpers";
import { readCronJobs } from "@/lib/crons";
import { patchProject, deleteProject, PatchProjectBody } from "@/db/queries/projects";

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
  const userId = await getCurrentUserId();
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
  const userId = await getCurrentUserId();
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
  const userId = await getCurrentUserId();
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const id = idOrResp;

  const [project] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)));

  if (!project) return NextResponse.json(null, { status: 404 });

  // Parallel: attrs, relations, interactions, linked goals, and devLog are independent
  const [attrMap, relations, recentInteractions, linkedGoals, userProject] = await Promise.all([
    fetchAttributesByEntityIds([id]),
    db
      .select()
      .from(entityRelations)
      .where(and(eq(entityRelations.fromEntityId, id), eq(entityRelations.userId, userId))),
    db
      .select()
      .from(interactions)
      .where(and(eq(interactions.entityId, id), eq(interactions.userId, userId)))
      .orderBy(desc(interactions.occurredAt))
      .limit(5),
    db
      .select({
        id: goals.id,
        title: goals.title,
        description: goals.description,
        status: goals.status,
        progress: goals.progress,
        targetDate: goals.targetDate,
        milestones: goals.milestones,
      })
      .from(goals)
      .where(and(eq(goals.entityId, id), eq(goals.userId, userId)))
      .orderBy(desc(goals.progress)),
    db.query.userProjects.findFirst({
      where: and(eq(userProjects.userId, userId), ilike(userProjects.name, project.name)),
      columns: { devLog: true },
    }),
  ]);

  const attrs = attrMap.get(id) ?? {};

  // Related entity names require relation IDs from above
  const relatedIds = relations.map((r) => r.toEntityId);
  let relatedEntities: Array<{ id: string; name: string; type: string }> = [];
  if (relatedIds.length > 0) {
    relatedEntities = await db
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.userId, userId), inArray(entities.id, relatedIds)));
  }

  const relationsWithNames = relations.map((r) => ({
    type: r.type,
    strength: r.strength,
    targetId: r.toEntityId,
    targetName: relatedEntities.find((e) => e.id === r.toEntityId)?.name ?? r.toEntityId,
    targetType: relatedEntities.find((e) => e.id === r.toEntityId)?.type ?? "unknown",
  }));

  const linkedJobs = getLinkedJobs(project.id, project.name);

  return NextResponse.json({
    id: project.id,
    name: project.name,
    type: project.type,
    description: project.description,
    source: project.source,
    attrs,
    relations: relationsWithNames,
    interactions: recentInteractions.map((i) => ({
      channel: i.channel,
      direction: i.direction,
      summary: i.summary,
      occurredAt: i.occurredAt,
    })),
    linkedJobs,
    linkedGoals,
    devLog: [...(userProject?.devLog ?? [])].reverse().slice(0, 20),
  });
}
