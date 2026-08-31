import { db } from "@/db";
import {
  entities,
  attributes,
  interactions,
  entityRelations,
  goals,
  prompts,
  userProjects,
  claudeCodeHistory,
  promptHistory,
  controlAuditEvents,
  projectStates,
  subscriptions,
  commitments,
  actions,
  frontierProposals,
  orchestrationEvents,
  orchestrationRuns,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { fetchAttributesByEntityIds } from "./utils";
import {
  pickCanonicalProject,
  projectNameKey,
  type ProjectEntityScoreInput,
} from "@/lib/domain/project-canonical";

export interface DuplicateProjectGroup {
  userId: string;
  nameKey: string;
  members: ProjectEntityScoreInput[];
  winner: ProjectEntityScoreInput;
  losers: ProjectEntityScoreInput[];
}

export async function findDuplicateProjectEntityGroups(
  userId?: string,
): Promise<DuplicateProjectGroup[]> {
  const where = userId
    ? and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT))
    : eq(entities.type, ENTITY_TYPE.PROJECT);

  const rows = await db
    .select({
      id: entities.id,
      userId: entities.userId,
      name: entities.name,
      description: entities.description,
      gitUrl: entities.gitUrl,
    })
    .from(entities)
    .where(where);

  const ids = rows.map((r) => r.id);
  const attrsByEntity = await fetchAttributesByEntityIds(ids);

  const runtimeRows = ids.length
    ? await db
        .select({ entityProjectId: userProjects.entityProjectId, dirPath: userProjects.dirPath })
        .from(userProjects)
        .where(inArray(userProjects.entityProjectId, ids))
    : [];

  const dirByEntity = new Map<string, string | null>();
  for (const r of runtimeRows) {
    if (r.entityProjectId && r.dirPath) dirByEntity.set(r.entityProjectId, r.dirPath);
  }

  const grouped = new Map<string, ProjectEntityScoreInput[]>();
  for (const row of rows) {
    const member: ProjectEntityScoreInput = {
      id: row.id,
      name: row.name,
      description: row.description,
      gitUrl: row.gitUrl,
      attrs: attrsByEntity.get(row.id) ?? {},
      dirPath: dirByEntity.get(row.id) ?? null,
    };
    const key = `${row.userId}::${projectNameKey(row.name)}`;
    const list = grouped.get(key) ?? [];
    list.push(member);
    grouped.set(key, list);
  }

  const out: DuplicateProjectGroup[] = [];
  for (const [key, members] of grouped) {
    if (members.length < 2) continue;
    const winner = pickCanonicalProject(members);
    out.push({
      userId: key.split("::")[0]!,
      nameKey: key.split("::")[1]!,
      members,
      winner,
      losers: members.filter((m) => m.id !== winner.id),
    });
  }

  return out.sort((a, b) => a.nameKey.localeCompare(b.nameKey));
}

/** Repoint loser → winner and delete the loser entity. Runs in one transaction. */
export async function mergeProjectEntityPair(
  winnerId: string,
  loserId: string,
  userId: string,
): Promise<void> {
  if (winnerId === loserId) return;

  await db.transaction(async (tx) => {
    const [winner, loser] = await Promise.all([
      tx
        .select()
        .from(entities)
        .where(and(eq(entities.id, winnerId), eq(entities.userId, userId)))
        .limit(1),
      tx
        .select()
        .from(entities)
        .where(and(eq(entities.id, loserId), eq(entities.userId, userId)))
        .limit(1),
    ]);
    if (!winner[0] || !loser[0])
      throw new Error(`mergeProjectEntityPair: missing entity ${winnerId}/${loserId}`);

    const loserAttrs = await tx.select().from(attributes).where(eq(attributes.entityId, loserId));
    const winnerAttrs = await tx.select().from(attributes).where(eq(attributes.entityId, winnerId));
    const winnerKeys = new Set(winnerAttrs.map((a) => a.key));

    for (const attr of loserAttrs) {
      if (winnerKeys.has(attr.key)) {
        await tx.delete(attributes).where(eq(attributes.id, attr.id));
      } else {
        await tx
          .update(attributes)
          .set({ entityId: winnerId, updatedAt: new Date() })
          .where(eq(attributes.id, attr.id));
      }
    }

    await tx
      .update(interactions)
      .set({ entityId: winnerId })
      .where(eq(interactions.entityId, loserId));

    const fromRels = await tx
      .select()
      .from(entityRelations)
      .where(eq(entityRelations.fromEntityId, loserId));
    for (const rel of fromRels) {
      const clash = await tx
        .select({ id: entityRelations.id })
        .from(entityRelations)
        .where(
          and(
            eq(entityRelations.userId, rel.userId),
            eq(entityRelations.fromEntityId, winnerId),
            eq(entityRelations.type, rel.type),
            eq(entityRelations.toEntityId, rel.toEntityId),
          ),
        )
        .limit(1);
      if (clash[0]) await tx.delete(entityRelations).where(eq(entityRelations.id, rel.id));
      else
        await tx
          .update(entityRelations)
          .set({ fromEntityId: winnerId, updatedAt: new Date() })
          .where(eq(entityRelations.id, rel.id));
    }

    const toRels = await tx
      .select()
      .from(entityRelations)
      .where(eq(entityRelations.toEntityId, loserId));
    for (const rel of toRels) {
      const clash = await tx
        .select({ id: entityRelations.id })
        .from(entityRelations)
        .where(
          and(
            eq(entityRelations.userId, rel.userId),
            eq(entityRelations.fromEntityId, rel.fromEntityId),
            eq(entityRelations.type, rel.type),
            eq(entityRelations.toEntityId, winnerId),
          ),
        )
        .limit(1);
      if (clash[0]) await tx.delete(entityRelations).where(eq(entityRelations.id, rel.id));
      else
        await tx
          .update(entityRelations)
          .set({ toEntityId: winnerId, updatedAt: new Date() })
          .where(eq(entityRelations.id, rel.id));
    }

    await tx.update(goals).set({ entityId: winnerId }).where(eq(goals.entityId, loserId));
    await tx.update(prompts).set({ projectId: winnerId }).where(eq(prompts.projectId, loserId));
    await tx
      .update(userProjects)
      .set({ entityProjectId: winnerId })
      .where(eq(userProjects.entityProjectId, loserId));
    await tx
      .update(claudeCodeHistory)
      .set({ projectId: winnerId })
      .where(eq(claudeCodeHistory.projectId, loserId));
    await tx
      .update(promptHistory)
      .set({ projectId: winnerId })
      .where(eq(promptHistory.projectId, loserId));
    await tx
      .update(controlAuditEvents)
      .set({ projectId: winnerId })
      .where(eq(controlAuditEvents.projectId, loserId));
    await tx
      .update(orchestrationRuns)
      .set({ projectId: winnerId })
      .where(eq(orchestrationRuns.projectId, loserId));

    await tx.delete(projectStates).where(eq(projectStates.projectId, loserId));
    await tx
      .update(subscriptions)
      .set({ entityId: winnerId })
      .where(eq(subscriptions.entityId, loserId));
    await tx
      .update(commitments)
      .set({ entityId: winnerId })
      .where(eq(commitments.entityId, loserId));
    await tx.update(actions).set({ entityId: winnerId }).where(eq(actions.entityId, loserId));
    await tx
      .update(frontierProposals)
      .set({ entityId: winnerId })
      .where(eq(frontierProposals.entityId, loserId));
    await tx
      .update(orchestrationEvents)
      .set({ projectId: winnerId })
      .where(eq(orchestrationEvents.projectId, loserId));
    await tx
      .update(orchestrationRuns)
      .set({ projectId: winnerId })
      .where(eq(orchestrationRuns.projectId, loserId));

    await tx
      .update(entities)
      .set({
        description: winner[0].description ?? loser[0].description,
        gitUrl: winner[0].gitUrl ?? loser[0].gitUrl,
        metadata: winner[0].metadata ?? loser[0].metadata,
        updatedAt: new Date(),
      })
      .where(eq(entities.id, winnerId));

    await tx.delete(entities).where(eq(entities.id, loserId));
  });
}

export async function mergeAllDuplicateProjectEntities(opts: {
  dryRun: boolean;
  userId?: string;
}): Promise<{ groups: number; merged: number; deleted: number }> {
  const groups = await findDuplicateProjectEntityGroups(opts.userId);
  let merged = 0;
  let deleted = 0;

  for (const group of groups) {
    for (const loser of group.losers) {
      if (opts.dryRun) {
        console.log(
          `  would merge ${loser.name} (${loser.id}) → ${group.winner.name} (${group.winner.id})`,
        );
      } else {
        await mergeProjectEntityPair(group.winner.id, loser.id, group.userId);
        console.log(`  merged ${loser.name} → ${group.winner.name}`);
      }
      merged += 1;
      deleted += 1;
    }
  }

  return { groups: groups.length, merged, deleted };
}

/** Case-insensitive lookup — SSOT for project entity resolution. */
export async function findProjectEntityByName(userId: string, name: string) {
  const [row] = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(
      and(
        eq(entities.userId, userId),
        eq(entities.type, ENTITY_TYPE.PROJECT),
        sql`lower(${entities.name}) = lower(${name.trim()})`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Remove RAG rows keyed by project name (source_id or metadata.project). */
export async function purgeProjectKnowledgeEmbeddings(
  userId: string,
  projectKey: string,
): Promise<number> {
  const key = projectKey.trim();
  const result = await db.execute(sql`
    DELETE FROM knowledge_embeddings
    WHERE user_id = ${userId}
      AND (
        lower(source_id) = lower(${key})
        OR lower(metadata->>'project') = lower(${key})
      )
  `);
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}

/** Delete orphan runtime rows whose tab name matches a retired project. */
export async function deleteUserProjectByName(userId: string, name: string): Promise<number> {
  const deleted = await db
    .delete(userProjects)
    .where(
      and(
        eq(userProjects.userId, userId),
        sql`lower(${userProjects.name}) = lower(${name.trim()})`,
      ),
    )
    .returning({ id: userProjects.id });
  return deleted.length;
}

/**
 * Retire a project entity with no canonical merge target. Cascades attrs/interactions;
 * nulls FKs on goals/history; deletes matching user_projects + knowledge_embeddings rows.
 */
export async function deleteProjectEntityByName(
  userId: string,
  name: string,
): Promise<{ name: string; id: string }> {
  const row = await findProjectEntityByName(userId, name);
  if (!row) throw new Error(`deleteProjectEntityByName: no project "${name}" for user ${userId}`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM knowledge_embeddings
      WHERE user_id = ${userId}
        AND (
          lower(source_id) = lower(${row.name})
          OR lower(metadata->>'project') = lower(${row.name})
        )
    `);
    await tx
      .delete(userProjects)
      .where(
        and(eq(userProjects.userId, userId), sql`lower(${userProjects.name}) = lower(${row.name})`),
      );
    await tx.delete(projectStates).where(eq(projectStates.projectId, row.id));
    await tx.delete(entities).where(and(eq(entities.id, row.id), eq(entities.userId, userId)));
  });

  return { name: row.name, id: row.id };
}

/** Merge loser → winner, purge loser RAG rows, drop loser runtime tab if present. */
export async function retireProjectMerge(
  userId: string,
  winnerName: string,
  loserName: string,
): Promise<{ winner: string; loser: string }> {
  const winner = await findProjectEntityByName(userId, winnerName);
  const loser = await findProjectEntityByName(userId, loserName);
  if (!winner) throw new Error(`retireProjectMerge: winner "${winnerName}" not found`);
  if (!loser) throw new Error(`retireProjectMerge: loser "${loserName}" not found`);

  await mergeProjectEntityPair(winner.id, loser.id, userId);
  await purgeProjectKnowledgeEmbeddings(userId, loser.name);
  await deleteUserProjectByName(userId, loser.name);

  return { winner: winner.name, loser: loser.name };
}
