import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { entities, projectShares, type ProjectShare } from "@/db/schema";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export type ProjectShareInput = Partial<Pick<
  ProjectShare,
  "audience" | "includeRoadmap" | "includeChangelog" | "includeResources" | "includeRepo" | "includeLiveUrl"
>>;

export async function getActiveProjectShare(userId: string, projectId: string): Promise<ProjectShare | null> {
  const row = await db.query.projectShares.findFirst({
    where: and(eq(projectShares.userId, userId), eq(projectShares.projectId, projectId), isNull(projectShares.revokedAt)),
  });
  return row ?? null;
}

export async function getProjectShareByToken(token: string): Promise<ProjectShare | null> {
  const row = await db.query.projectShares.findFirst({
    where: and(eq(projectShares.token, token), isNull(projectShares.revokedAt)),
  });
  return row ?? null;
}

export async function upsertProjectShare(userId: string, projectId: string, input: ProjectShareInput = {}): Promise<ProjectShare | null> {
  const project = await db.query.entities.findFirst({
    where: and(eq(entities.id, projectId), eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)),
    columns: { id: true },
  });
  if (!project) return null;

  const existing = await getActiveProjectShare(userId, projectId);
  const patch = {
    audience: input.audience ?? "advisor",
    includeRoadmap: input.includeRoadmap ?? true,
    includeChangelog: input.includeChangelog ?? true,
    includeResources: input.includeResources ?? true,
    includeRepo: input.includeRepo ?? false,
    includeLiveUrl: input.includeLiveUrl ?? true,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(projectShares)
      .set(patch)
      .where(and(eq(projectShares.id, existing.id), eq(projectShares.userId, userId)))
      .returning();
    return updated ?? null;
  }

  const [created] = await db
    .insert(projectShares)
    .values({
      ...patch,
      userId,
      projectId,
      token: randomBytes(24).toString("base64url"),
    })
    .returning();
  return created ?? null;
}

export async function revokeProjectShare(userId: string, projectId: string): Promise<boolean> {
  const [revoked] = await db
    .update(projectShares)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projectShares.userId, userId), eq(projectShares.projectId, projectId), isNull(projectShares.revokedAt)))
    .returning({ id: projectShares.id });
  return Boolean(revoked);
}
