import { and, asc, count, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { entities, orgs, userProjects, type NewUserProject, type UserProject } from "@/db/schema";
import type { DevLogEntry } from "@/db/schema/user-projects";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { getOrgPeerIds } from "./utils";

export async function getUserProjects(userId: string): Promise<UserProject[]> {
  return db
    .select()
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)))
    .orderBy(asc(userProjects.position), asc(userProjects.createdAt));
}

/**
 * Returns active projects belonging to other members of the user's orgs.
 * Queries by org membership (not orgId on the project) so it works
 * regardless of whether projects have been explicitly org-tagged.
 */
export async function getOrgProjects(userId: string): Promise<UserProject[]> {
  const peerIds = await getOrgPeerIds(userId);
  if (peerIds.length === 0) return [];
  return db
    .select()
    .from(userProjects)
    .where(and(inArray(userProjects.userId, peerIds), eq(userProjects.isActive, true)))
    .orderBy(asc(userProjects.position), asc(userProjects.createdAt));
}

export async function countActiveProjects(userId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)));
  return value;
}

async function findOrCreateProjectEntity(userId: string, name: string, description?: string | null): Promise<string> {
  const [existing] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT), eq(entities.name, name)))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(entities)
    .values({
      userId,
      name,
      type: ENTITY_TYPE.PROJECT,
      description: description?.trim() || null,
      source: "control",
    })
    .returning({ id: entities.id });

  return created.id;
}

export async function ensureUserProjectEntityLinks(userId: string): Promise<UserProject[]> {
  const projects = await getUserProjects(userId);
  const linked: UserProject[] = [];

  for (const project of projects) {
    if (project.entityProjectId) {
      linked.push(project);
      continue;
    }

    const entityProjectId = await findOrCreateProjectEntity(userId, project.name, project.description);
    const [updated] = await db
      .update(userProjects)
      .set({ entityProjectId, updatedAt: new Date() })
      .where(and(eq(userProjects.id, project.id), eq(userProjects.userId, userId)))
      .returning();

    linked.push(updated ?? { ...project, entityProjectId });
  }

  return linked;
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
  const entityProjectId = data.entityProjectId ?? await findOrCreateProjectEntity(data.userId, data.name, data.description);

  // Auto-link to the user's primary org so team members can see it via getOrgProjects.
  let orgId = data.orgId ?? null;
  if (!orgId) {
    const [orgRow] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.ownerId, data.userId)).limit(1);
    orgId = orgRow?.id ?? null;
  }

  const [row] = await db.insert(userProjects).values({ ...data, entityProjectId, orgId }).returning();
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

async function writeDevLog(id: string, existing: DevLogEntry[], entry: DevLogEntry): Promise<void> {
  const updated = [...existing, entry].slice(-DEV_LOG_MAX);
  await db.update(userProjects).set({ devLog: updated, updatedAt: new Date() }).where(eq(userProjects.id, id));
}

/**
 * Append a dev log entry identified by project name, capping at DEV_LOG_MAX.
 * No-ops for projects not in DB. Caller is responsible for deduplication.
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
  await writeDevLog(project.id, (project.devLog ?? []) as DevLogEntry[], entry);
}

export async function appendProjectDevLogByEntityProjectId(
  userId: string,
  entityProjectId: string,
  entry: DevLogEntry,
): Promise<void> {
  const project = await db.query.userProjects.findFirst({
    where: and(eq(userProjects.userId, userId), eq(userProjects.entityProjectId, entityProjectId)),
    columns: { id: true, devLog: true },
  });
  if (!project) return;
  await writeDevLog(project.id, (project.devLog ?? []) as DevLogEntry[], entry);
}

/**
 * Returns all distinct userIds that have registered projects.
 * Used by the daemon when claiming pending commands — the daemon services all
 * local projects regardless of which DB user row owns them, so we must drain
 * commands for every userId rather than just the isDefault one.
 */
export async function getAllDistinctUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: userProjects.userId })
    .from(userProjects);
  return rows.map((r) => r.userId);
}
