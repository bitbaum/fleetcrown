import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userProjects, type NewUserProject, type UserProject } from "@/db/schema";

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
