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

/**
 * Forget a link to an OrangeCat entity.
 *
 * The counterpart to linkOrangeCatEntity, and it did not exist: links could
 * only ever be added, so a project that had been published there carried that
 * fact for good even after the page came down. Scoped to one entity TYPE per
 * call so unpublishing a project cannot silently drop a funding or community
 * link the operator still wants.
 */
export async function unlinkOrangeCatEntity(input: {
  userId: string;
  projectId: string;
  entityType: string;
}): Promise<number> {
  const removed = await db
    .delete(orangecatEntityLinks)
    .where(
      and(
        eq(orangecatEntityLinks.userId, input.userId),
        eq(orangecatEntityLinks.projectId, input.projectId),
        eq(orangecatEntityLinks.entityType, input.entityType),
      ),
    )
    .returning({ id: orangecatEntityLinks.id });
  return removed.length;
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
