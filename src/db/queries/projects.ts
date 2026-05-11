import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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
