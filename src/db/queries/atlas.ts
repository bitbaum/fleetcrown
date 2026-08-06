import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSnapshots, userProjects } from "@/db/schema";
import type { SiteProbeResult } from "@/lib/atlas/probe";

export type AtlasRow = {
  projectId: string;
  /** Entity id — what /projects/[id] routes by. Null until the project is
   *  linked to an entity, so the profile link is conditional. */
  entityId: string | null;
  name: string;
  description: string | null;
  liveUrl: string | null;
  gitUrl: string | null;
  snapshot: {
    finalUrl: string | null;
    statusCode: number | null;
    ok: boolean;
    responseMs: number | null;
    title: string | null;
    description: string | null;
    previewImageUrl: string | null;
    outboundHosts: string[];
    internalPaths: string[];
    error: string | null;
    checkedAt: Date;
  } | null;
};

/**
 * Every active project with its latest site observation. Projects WITHOUT a
 * live_url are included on purpose — "this project has no site yet" is the most
 * common gap the Atlas exists to surface, and filtering it out would hide it.
 */
export async function getAtlasRows(userId: string): Promise<AtlasRow[]> {
  const rows = await db
    .select({
      projectId: userProjects.id,
      entityId: userProjects.entityProjectId,
      name: userProjects.name,
      description: userProjects.description,
      liveUrl: userProjects.liveUrl,
      gitUrl: userProjects.gitUrl,
      snapFinalUrl: siteSnapshots.finalUrl,
      snapStatus: siteSnapshots.statusCode,
      snapOk: siteSnapshots.ok,
      snapMs: siteSnapshots.responseMs,
      snapTitle: siteSnapshots.title,
      snapDescription: siteSnapshots.description,
      snapImage: siteSnapshots.previewImageUrl,
      snapHosts: siteSnapshots.outboundHosts,
      snapPaths: siteSnapshots.internalPaths,
      snapError: siteSnapshots.error,
      snapCheckedAt: siteSnapshots.checkedAt,
    })
    .from(userProjects)
    .leftJoin(siteSnapshots, eq(siteSnapshots.projectId, userProjects.id))
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)))
    .orderBy(asc(userProjects.position), asc(userProjects.name));

  return rows.map((r) => ({
    projectId: r.projectId,
    entityId: r.entityId,
    name: r.name,
    description: r.description,
    liveUrl: r.liveUrl,
    gitUrl: r.gitUrl,
    snapshot: r.snapCheckedAt
      ? {
          finalUrl: r.snapFinalUrl,
          statusCode: r.snapStatus,
          ok: r.snapOk ?? false,
          responseMs: r.snapMs,
          title: r.snapTitle,
          description: r.snapDescription,
          previewImageUrl: r.snapImage,
          outboundHosts: r.snapHosts ?? [],
          internalPaths: r.snapPaths ?? [],
          error: r.snapError,
          checkedAt: r.snapCheckedAt,
        }
      : null,
  }));
}

/** Projects that have a site to probe. */
export async function getProbeTargets(userId: string): Promise<{ id: string; liveUrl: string }[]> {
  const rows = await db
    .select({ id: userProjects.id, liveUrl: userProjects.liveUrl })
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)));
  return rows.flatMap((r) => (r.liveUrl ? [{ id: r.id, liveUrl: r.liveUrl }] : []));
}

export async function saveSiteSnapshot(
  userId: string,
  projectId: string,
  probe: SiteProbeResult,
): Promise<void> {
  const values = {
    projectId,
    userId,
    requestedUrl: probe.requestedUrl,
    finalUrl: probe.finalUrl,
    statusCode: probe.statusCode,
    ok: probe.ok,
    responseMs: probe.responseMs,
    title: probe.title,
    description: probe.description,
    previewImageUrl: probe.previewImageUrl,
    outboundHosts: probe.outboundHosts,
    internalPaths: probe.internalPaths,
    error: probe.error,
    checkedAt: new Date(),
  };
  await db
    .insert(siteSnapshots)
    .values(values)
    .onConflictDoUpdate({ target: siteSnapshots.projectId, set: values });
}

/** Set (or clear, with null) where a project lives on the public web. */
export async function setProjectLiveUrl(
  userId: string,
  projectId: string,
  liveUrl: string | null,
): Promise<boolean> {
  const updated = await db
    .update(userProjects)
    .set({ liveUrl, updatedAt: new Date() })
    .where(and(eq(userProjects.id, projectId), eq(userProjects.userId, userId)))
    .returning({ id: userProjects.id });
  return updated.length > 0;
}

/** One project's Atlas row. Reuses getAtlasRows so the detail page and the grid
 *  can never disagree about what a row contains. */
export async function getAtlasRow(userId: string, projectId: string): Promise<AtlasRow | null> {
  const rows = await getAtlasRows(userId);
  return rows.find((r) => r.projectId === projectId) ?? null;
}
