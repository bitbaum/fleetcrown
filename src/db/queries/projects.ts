import { DEFAULT_USER_ID } from "@/lib/constants";
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

export async function getProjects() {
  const projects = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.userId, DEFAULT_USER_ID),
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
