import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  orangecatEntityLinks,
  userProjects,
  type OrangeCatEntityLink,
  type OrangeCatLinkRole,
} from "@/db/schema";

export async function getOrangeCatLinksForProject(
  userId: string,
  userProjectId: string,
): Promise<OrangeCatEntityLink[]> {
  return db
    .select()
    .from(orangecatEntityLinks)
    .where(
      and(
        eq(orangecatEntityLinks.userId, userId),
        eq(orangecatEntityLinks.projectId, userProjectId),
      ),
    );
}

export async function linkOrangeCatEntity(input: {
  userId: string;
  projectId: string;
  entityType: string;
  entityId: string;
  role: OrangeCatLinkRole;
  publicUrl: string;
  title?: string | null;
}): Promise<void> {
  await db.insert(orangecatEntityLinks).values(input).onConflictDoNothing();
}

export async function getProjectsByOrangeCatEntity(entityType: string, entityId: string) {
  return db
    .select({ project: userProjects, link: orangecatEntityLinks })
    .from(orangecatEntityLinks)
    .innerJoin(userProjects, eq(userProjects.id, orangecatEntityLinks.projectId))
    .where(
      and(
        eq(orangecatEntityLinks.entityType, entityType),
        eq(orangecatEntityLinks.entityId, entityId),
      ),
    );
}

export async function getProjectByOrangeCatEntity(entityType: string, entityId: string) {
  const [row] = await getProjectsByOrangeCatEntity(entityType, entityId);
  return row ?? null;
}

/**
 * Every OrangeCat link this user owns, across all their projects.
 *
 * The build handoff picker needs this: without it the picker offered projects
 * that were already the origin of a *different* OrangeCat entity, and
 * confirming repointed `user_projects.orangecat_project_id` with no warning.
 */
export async function getOrangeCatLinksForUser(userId: string): Promise<OrangeCatEntityLink[]> {
  return db.select().from(orangecatEntityLinks).where(eq(orangecatEntityLinks.userId, userId));
}
