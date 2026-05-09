import { and, asc, eq, ilike, isNotNull } from "drizzle-orm";
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

export async function getPublicProjects(userId: string): Promise<UserProject[]> {
  return db
    .select()
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true), isNotNull(userProjects.gitUrl)))
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
  data: Partial<Pick<UserProject, "name" | "dirPath" | "gitUrl" | "description" | "stack" | "agentPref" | "modelPref" | "position" | "isActive" | "notes">>,
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

const DEV_LOG_MAX = 50;

/**
 * Append a dev log entry to a user project identified by name, capping at
 * DEV_LOG_MAX entries (oldest removed first). No-ops for projects not in DB.
 * Caller is responsible for deduplication — append only when content changed.
 */
export async function appendProjectDevLog(
  userId: string,
  projectName: string,
  entry: DevLogEntry,
): Promise<void> {
  const project = await db.query.userProjects.findFirst({
    where: and(eq(userProjects.userId, userId), ilike(userProjects.name, projectName)),
    columns: { id: true, devLog: true },
  });
  if (!project) return;
  const existing = (project.devLog ?? []) as DevLogEntry[];
  const updated = [...existing, entry].slice(-DEV_LOG_MAX);
  await db
    .update(userProjects)
    .set({ devLog: updated, updatedAt: new Date() })
    .where(eq(userProjects.id, project.id));
}
