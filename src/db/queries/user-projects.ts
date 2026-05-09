import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { userProjects, type NewUserProject, type UserProject } from "@/db/schema";
import type { DevLogEntry } from "@/db/schema/user-projects";

export async function getUserProjects(userId: string): Promise<UserProject[]> {
  return db
    .select()
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)))
    .orderBy(asc(userProjects.position), asc(userProjects.createdAt));
}

export async function getUserProject(id: string, userId: string): Promise<UserProject | null> {
  const [row] = await db
    .select()
    .from(userProjects)
    .where(and(eq(userProjects.id, id), eq(userProjects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createUserProject(
  data: Omit<NewUserProject, "id" | "createdAt" | "updatedAt">,
): Promise<UserProject> {
  const [row] = await db.insert(userProjects).values(data).returning();
  return row;
}

export async function updateUserProject(
  id: string,
  userId: string,
  data: Partial<Pick<UserProject, "name" | "dirPath" | "gitUrl" | "description" | "stack" | "agentPref" | "modelPref" | "position" | "isActive">>,
): Promise<UserProject | null> {
  const [row] = await db
    .update(userProjects)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(userProjects.id, id), eq(userProjects.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteUserProject(id: string, userId: string): Promise<void> {
  await db
    .delete(userProjects)
    .where(and(eq(userProjects.id, id), eq(userProjects.userId, userId)));
}

/**
 * Append a dev log entry to a user project identified by name.
 * No-ops when the project is not found in the DB (e.g. conf-file-only projects).
 * Caller is responsible for deduplication — append only when content actually changed.
 */
export async function appendProjectDevLog(
  userId: string,
  projectName: string,
  entry: DevLogEntry,
): Promise<void> {
  const project = await db.query.userProjects.findFirst({
    where: and(eq(userProjects.userId, userId), ilike(userProjects.name, projectName)),
    columns: { id: true },
  });
  if (!project) return;
  await db
    .update(userProjects)
    .set({
      devLog: sql`coalesce(${userProjects.devLog}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(userProjects.id, project.id));
}
