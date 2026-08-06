import { and, asc, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { siteGuides, userProjects, type GuideStep, type SiteGuide } from "@/db/schema";

export async function getGuides(userId: string, projectId: string): Promise<SiteGuide[]> {
  return db
    .select()
    .from(siteGuides)
    .where(and(eq(siteGuides.userId, userId), eq(siteGuides.projectId, projectId)))
    .orderBy(asc(siteGuides.position), asc(siteGuides.createdAt));
}

/** Guard: a guide may only be attached to a project the caller owns. */
async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userProjects.id })
    .from(userProjects)
    .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)));
  return Boolean(row);
}

export async function createGuide(
  userId: string,
  projectId: string,
  input: { title: string; description?: string | null; steps: GuideStep[] },
): Promise<SiteGuide | null> {
  if (!(await ownsProject(userId, projectId))) return null;

  // Append, don't prepend: a new guide belongs after the ones already written,
  // otherwise adding one silently reorders the list the user just arranged.
  const [{ highest }] = await db
    .select({ highest: max(siteGuides.position) })
    .from(siteGuides)
    .where(and(eq(siteGuides.userId, userId), eq(siteGuides.projectId, projectId)));

  const [created] = await db
    .insert(siteGuides)
    .values({
      userId,
      projectId,
      title: input.title,
      description: input.description ?? null,
      steps: input.steps,
      position: (highest ?? -1) + 1,
    })
    .returning();
  return created ?? null;
}

export async function updateGuide(
  userId: string,
  guideId: string,
  patch: { title?: string; description?: string | null; steps?: GuideStep[] },
): Promise<SiteGuide | null> {
  const [updated] = await db
    .update(siteGuides)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(siteGuides.id, guideId), eq(siteGuides.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteGuide(userId: string, guideId: string): Promise<boolean> {
  const deleted = await db
    .delete(siteGuides)
    .where(and(eq(siteGuides.id, guideId), eq(siteGuides.userId, userId)))
    .returning({ id: siteGuides.id });
  return deleted.length > 0;
}
