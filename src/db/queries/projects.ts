import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { entities, entityRelations, interactions, goals, userProjects } from "@/db/schema";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";
import { fetchAttributesByEntityIds } from "./utils";
import { z } from "zod";

export const CreateProjectBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  description: z.string().trim().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectBody>;

export const PatchProjectBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    description: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

type PatchProjectInput = z.infer<typeof PatchProjectBody>;

export async function createProject(userId: string, data: CreateProjectInput, source?: string) {
  const [created] = await db
    .insert(entities)
    .values({
      userId,
      name: data.name,
      type: ENTITY_TYPE.PROJECT,
      description: data.description || null,
      source: source ?? null,
    })
    .returning({ id: entities.id, name: entities.name });
  return created;
}

export async function patchProject(userId: string, id: string, data: PatchProjectInput) {
  const patch: Partial<typeof entities.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description.trim() || null;
  const [updated] = await db
    .update(entities)
    .set(patch)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)))
    .returning({ id: entities.id });
  return updated ?? null;
}

export async function deleteProject(userId: string, id: string) {
  const [deleted] = await db
    .delete(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)))
    .returning({ id: entities.id });
  return deleted ?? null;
}

export async function getProjects(userId: string) {
  const projects = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.userId, userId),
        eq(entities.type, ENTITY_TYPE.PROJECT),
      ),
    )
    .orderBy(entities.name);

  const attrsByEntity = await fetchAttributesByEntityIds(projects.map((p) => p.id));

  return projects.map((p) => ({
    ...p,
    attrs: attrsByEntity.get(p.id) ?? {},
  }));
}

export type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];

export async function getProjectDetail(userId: string, id: string) {
  const [project] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)));

  if (!project) return null;

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
    db.query.userProjects
      .findFirst({
        where: and(eq(userProjects.userId, userId), eq(userProjects.entityProjectId, project.id)),
        columns: { devLog: true },
      })
      .then(
        (linked) =>
          linked ??
          db.query.userProjects.findFirst({
            where: and(eq(userProjects.userId, userId), ilike(userProjects.name, project.name)),
            columns: { devLog: true },
          }),
      ),
  ]);

  const relatedIds = relations.map((r) => r.toEntityId);
  const relatedEntities =
    relatedIds.length > 0
      ? await db
          .select({ id: entities.id, name: entities.name, type: entities.type })
          .from(entities)
          .where(and(eq(entities.userId, userId), inArray(entities.id, relatedIds)))
      : [];

  return {
    project,
    attrs: attrMap.get(id) ?? {},
    relations: relations.map((r) => ({
      type: r.type,
      strength: r.strength,
      targetId: r.toEntityId,
      targetName: relatedEntities.find((e) => e.id === r.toEntityId)?.name ?? r.toEntityId,
      targetType: relatedEntities.find((e) => e.id === r.toEntityId)?.type ?? "unknown",
    })),
    recentInteractions: recentInteractions.map((i) => ({
      channel: i.channel,
      direction: i.direction,
      summary: i.summary,
      occurredAt: i.occurredAt,
    })),
    linkedGoals,
    devLog: userProject?.devLog ?? null,
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;
