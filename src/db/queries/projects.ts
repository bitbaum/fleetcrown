import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { db } from "@/db";
import { entities, entityRelations, interactions, goals, userProjects, orgMemberships, orgs } from "@/db/schema";
import { eq, and, desc, inArray, ilike } from "drizzle-orm";
import { fetchAttributesByEntityIds, getOrgPeerIds } from "./utils";
import { z } from "zod";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { AUTO_INJECT_MODE_VALUES, type AutoInjectMode } from "@/config/beacon";

export const RECENT_INTERACTION_LIMIT = 5;

export const CreateProjectBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  description: z.string().trim().optional(),
  /** Canonical repo URL (https://github.com/user/repo). Optional —
   *  set by GitHub-import flows and the cloud bootstrap. */
  gitUrl: z.string().trim().url().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectBody>;

export const PatchProjectBody = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    description: z.string().optional(),
    gitUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
    /** Per-project autopilot override. Pass null (or omit) to inherit the
     *  user-level beacon_settings.auto_inject_mode. Pass an AutoInjectMode
     *  value (e.g. "off", "queue_only", "strategist") to pin this project. */
    autoInjectModeOverride: z.union([
      z.enum(AUTO_INJECT_MODE_VALUES),
      z.null(),
    ]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

type PatchProjectInput = z.infer<typeof PatchProjectBody>;

export async function createProject(userId: string, data: CreateProjectInput, source?: string) {
  const [created] = await db
    .insert(entities)
    .values({
      userId,
      name: data.name,
      type: ENTITY_TYPE.PROJECT,
      description: data.description || null,
      gitUrl: data.gitUrl || null,
      source: source ?? null,
    })
    .returning({ id: entities.id, name: entities.name, gitUrl: entities.gitUrl });

  // Also ensure a user_projects row exists. /api/control reads from
  // user_projects (not directly from entities), so without this row the new
  // project lives on /projects but is invisible on /control — the exact gap
  // user dogfood surfaced on 2026-06-06 with truthseeker (entity inserted via
  // bootstrap-style flow, no user_projects link, missing from /control).
  // dir_path stays null until the user clones locally and registers the path
  // via /control/import-local; the UI will eventually surface a "needs local
  // clone" affordance for these rows (v0.7.1 work).
  const [orgRow] = await db
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.ownerId, userId))
    .limit(1);
  await db
    .insert(userProjects)
    .values({
      userId,
      entityProjectId: created.id,
      name: created.name,
      description: data.description || null,
      gitUrl: data.gitUrl || null,
      dirPath: null,
      isActive: true,
      orgId: orgRow?.id ?? null,
    })
    .onConflictDoNothing();

  return created;
}

export async function patchProject(userId: string, id: string, data: PatchProjectInput) {
  const patch: Partial<typeof entities.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description.trim() || null;
  if (data.gitUrl !== undefined) patch.gitUrl = data.gitUrl.trim() || null;
  if (data.autoInjectModeOverride !== undefined) {
    patch.autoInjectModeOverride = data.autoInjectModeOverride;
  }
  const [updated] = await db
    .update(entities)
    .set(patch)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)))
    .returning({ id: entities.id });
  return updated ?? null;
}

/**
 * Resolve a project's autopilot override by projectKey (the slug daemons and
 * dispatch routes use). Returns null when there's no override OR when the
 * stored value isn't a known AutoInjectMode (defensive — the column has no
 * CHECK constraint so unknown values must be tolerated). Project lookup is
 * by exact name match; FleetCrown bootstrap stores entities.name = projectKey
 * for cloud-created projects.
 */
export async function getProjectAutopilotOverride(
  userId: string,
  projectKey: string,
): Promise<AutoInjectMode | null> {
  const row = await db.query.entities.findFirst({
    where: and(
      eq(entities.userId, userId),
      eq(entities.name, projectKey),
      eq(entities.type, ENTITY_TYPE.PROJECT),
    ),
    columns: { autoInjectModeOverride: true },
  });
  const stored = row?.autoInjectModeOverride ?? null;
  if (!stored) return null;
  return AUTO_INJECT_MODE_VALUES.includes(stored as AutoInjectMode)
    ? (stored as AutoInjectMode)
    : null;
}

export async function deleteProject(userId: string, id: string) {
  const [deleted] = await db
    .delete(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)))
    .returning({ id: entities.id });
  return deleted ?? null;
}

// Fetch the user_projects runtime metadata (dirPath + agentPref) for a list
// of entity ids. Returned map is keyed by entityProjectId — entities without
// a linked user_projects row are absent (caller treats as null).
//
// user_projects is the SSOT for where the project lives on disk and which
// agent it prefers; the Projects page card needs both so bare-attr tiles show
// concrete context instead of just a clickable title.
async function fetchRuntimeMetaByEntityIds(
  entityIds: string[],
): Promise<Map<string, { dirPath: string | null; agentPref: string | null }>> {
  const out = new Map<string, { dirPath: string | null; agentPref: string | null }>();
  if (entityIds.length === 0) return out;
  const rows = await db
    .select({
      entityProjectId: userProjects.entityProjectId,
      dirPath: userProjects.dirPath,
      agentPref: userProjects.agentPref,
    })
    .from(userProjects)
    .where(inArray(userProjects.entityProjectId, entityIds));
  for (const r of rows) {
    if (r.entityProjectId) out.set(r.entityProjectId, { dirPath: r.dirPath, agentPref: r.agentPref });
  }
  return out;
}

export async function getProjects(userId: string) {
  const projects = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.userId, userId),
        eq(entities.type, ENTITY_TYPE.PROJECT),
      ),
    )
    .orderBy(entities.name);

  const ids = projects.map((p) => p.id);
  const [attrsByEntity, runtimeByEntity] = await Promise.all([
    fetchAttributesByEntityIds(ids),
    fetchRuntimeMetaByEntityIds(ids),
  ]);

  return projects.map((p) => {
    const runtime = runtimeByEntity.get(p.id) ?? { dirPath: null, agentPref: null };
    return {
      ...p,
      attrs: attrsByEntity.get(p.id) ?? {},
      dirPath: runtime.dirPath,
      agentPref: runtime.agentPref,
    };
  });
}

export type ProjectRow = Awaited<ReturnType<typeof getProjects>>[number];

/** Returns entity-level project profiles belonging to org peers (read-only for the viewer). */
export async function getOrgEntityProjects(userId: string): Promise<(ProjectRow & { readonly: true })[]> {
  const peerIds = await getOrgPeerIds(userId);
  if (peerIds.length === 0) return [];
  const projects = await db
    .select()
    .from(entities)
    .where(and(inArray(entities.userId, peerIds), eq(entities.type, ENTITY_TYPE.PROJECT)))
    .orderBy(entities.name);
  const ids = projects.map((p) => p.id);
  const [attrsByEntity, runtimeByEntity] = await Promise.all([
    fetchAttributesByEntityIds(ids),
    fetchRuntimeMetaByEntityIds(ids),
  ]);
  return projects.map((p) => {
    const runtime = runtimeByEntity.get(p.id) ?? { dirPath: null, agentPref: null };
    return {
      ...p,
      attrs: attrsByEntity.get(p.id) ?? {},
      dirPath: runtime.dirPath,
      agentPref: runtime.agentPref,
      readonly: true as const,
    };
  });
}

/**
 * Resolves project detail for a viewer who may not own the entity.
 * Falls back to org-member access: if the entity belongs to a peer in the
 * same org, returns the detail fetched under the owner's userId (read-only
 * from the viewer's perspective — PATCH/DELETE still require ownership).
 *
 * Returns { detail, ownerId } or null if no access.
 */
export async function resolveProjectDetailWithOrgFallback(
  viewerUserId: string,
  projectId: string,
): Promise<{ detail: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>; ownerId: string } | null> {
  // Fast path: viewer owns the entity.
  const ownDetail = await getProjectDetail(viewerUserId, projectId);
  if (ownDetail) return { detail: ownDetail, ownerId: viewerUserId };

  // Look up the entity without userId filter to find its actual owner.
  const [entity] = await db
    .select({ id: entities.id, userId: entities.userId })
    .from(entities)
    .where(and(eq(entities.id, projectId), eq(entities.type, ENTITY_TYPE.PROJECT)))
    .limit(1);

  if (!entity || entity.userId === viewerUserId) return null;

  // Check that viewer and owner share at least one org.
  const viewerOrgs = await db
    .select({ orgId: orgMemberships.orgId })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, viewerUserId));

  if (viewerOrgs.length === 0) return null;
  const orgIds = viewerOrgs.map((m) => m.orgId);

  const shared = await db
    .select({ id: orgMemberships.orgId })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, entity.userId), inArray(orgMemberships.orgId, orgIds)))
    .limit(1);

  if (shared.length === 0) return null;

  const detail = await getProjectDetail(entity.userId, projectId);
  return detail ? { detail, ownerId: entity.userId } : null;
}

export async function getProjectDetail(userId: string, id: string) {
  const [project] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, userId)));

  if (!project) return null;

  const privateLocked = await isPrivateZoneLocked(userId);
  const goalsPromise = privateLocked
    ? Promise.resolve([])
    : db
        .select({
          id: goals.id,
          title: goals.title,
          description: goals.description,
          status: goals.status,
          progress: goals.progress,
          targetDate: goals.targetDate,
          milestones: goals.milestones,
        })
        .from(goals)
        .where(and(eq(goals.entityId, id), eq(goals.userId, userId)))
        .orderBy(desc(goals.progress));

  const [attrMap, relations, recentInteractions, linkedGoals, userProject] = await Promise.all([
    fetchAttributesByEntityIds([id]),
    db
      .select()
      .from(entityRelations)
      .where(and(eq(entityRelations.fromEntityId, id), eq(entityRelations.userId, userId))),
    db
      .select()
      .from(interactions)
      .where(and(eq(interactions.entityId, id), eq(interactions.userId, userId)))
      .orderBy(desc(interactions.occurredAt))
      .limit(RECENT_INTERACTION_LIMIT),
    goalsPromise,
    db.query.userProjects
      .findFirst({
        where: and(eq(userProjects.userId, userId), eq(userProjects.entityProjectId, project.id)),
        columns: { devLog: true },
      })
      .then(
        (linked) =>
          linked ??
          db.query.userProjects.findFirst({
            where: and(eq(userProjects.userId, userId), ilike(userProjects.name, project.name)),
            columns: { devLog: true },
          }),
      ),
  ]);

  const relatedIds = relations.map((r) => r.toEntityId);
  const relatedEntities =
    relatedIds.length > 0
      ? await db
          .select({ id: entities.id, name: entities.name, type: entities.type })
          .from(entities)
          .where(and(eq(entities.userId, userId), inArray(entities.id, relatedIds)))
      : [];

  return {
    project,
    createdAt: project.createdAt,
    attrs: attrMap.get(id) ?? {},
    relations: relations.map((r) => ({
      type: r.type,
      strength: r.strength,
      targetId: r.toEntityId,
      targetName: relatedEntities.find((e) => e.id === r.toEntityId)?.name ?? r.toEntityId,
      targetType: relatedEntities.find((e) => e.id === r.toEntityId)?.type ?? "unknown",
    })),
    recentInteractions: recentInteractions.map((i) => ({
      channel: i.channel,
      direction: i.direction,
      summary: i.summary,
      occurredAt: i.occurredAt,
    })),
    linkedGoals,
    devLog: userProject?.devLog ?? null,
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;
