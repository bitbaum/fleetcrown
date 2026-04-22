import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, CRON_FILE } from "@/lib/constants";
import { db } from "@/db";
import { entities, entityRelations, interactions, goals } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { fetchAttributesByEntityIds } from "@/db/queries/utils";
import { isValidUuid } from "@/lib/utils";
import { readFileSync, existsSync } from "fs";

function getLinkedJobs(projectId: string, projectName: string) {
  try {
    if (!existsSync(CRON_FILE)) return [];
    const data = JSON.parse(readFileSync(CRON_FILE, "utf-8"));
    const jobs: Array<{ id: string; name: string; message: string; enabled: boolean; schedule: string; lastStatus?: string; consecutiveErrors?: number; projectId?: string }> = [];
    const nameLower = projectName.toLowerCase();
    for (const job of data.jobs ?? []) {
      // Primary: exact projectId match
      const byId = job.projectId === projectId;
      // Fallback: fuzzy name match in job name or message
      const jobNameLower = (job.name ?? "").toLowerCase();
      const msgLower = (job.payload?.message ?? "").toLowerCase();
      const byFuzzy = !job.projectId && (jobNameLower.includes(nameLower) || msgLower.includes(nameLower));
      if (byId || byFuzzy) {
        jobs.push({
          id: job.id,
          name: job.name,
          message: job.payload?.message ?? "",
          enabled: job.enabled,
          schedule: job.schedule?.expr ?? "",
          lastStatus: job.state?.lastStatus,
          consecutiveErrors: job.state?.consecutiveErrors ?? 0,
          projectId: job.projectId,
        });
      }
    }
    return jobs;
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUuid(id)) return NextResponse.json(null, { status: 400 });

  const [project] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, DEFAULT_USER_ID)));

  if (!project) return NextResponse.json(null, { status: 404 });

  // Parallel: attrs, relations, interactions, and linked goals are independent
  const [attrMap, relations, recentInteractions, linkedGoals] = await Promise.all([
    fetchAttributesByEntityIds([id]),
    db
      .select()
      .from(entityRelations)
      .where(and(eq(entityRelations.fromEntityId, id), eq(entityRelations.userId, DEFAULT_USER_ID))),
    db
      .select()
      .from(interactions)
      .where(and(eq(interactions.entityId, id), eq(interactions.userId, DEFAULT_USER_ID)))
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
      .where(and(eq(goals.entityId, id), eq(goals.userId, DEFAULT_USER_ID)))
      .orderBy(desc(goals.progress)),
  ]);

  const attrs = attrMap.get(id) ?? {};

  // Related entity names require relation IDs from above
  const relatedIds = relations.map((r) => r.toEntityId);
  let relatedEntities: Array<{ id: string; name: string; type: string }> = [];
  if (relatedIds.length > 0) {
    relatedEntities = await db
      .select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.userId, DEFAULT_USER_ID), inArray(entities.id, relatedIds)));
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
  });
}
