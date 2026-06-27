/**
 * Embed-on-write for project profiles — keeps the fleet-knowledge index fresh
 * when operators edit profile attrs or AI fills a brief. Fire-and-forget: never
 * blocks the save path; RAG is off when EMBEDDINGS_BASE_URL is unset.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { getProjectContext } from "@/db/queries/project-context";
import { upsertKnowledge } from "@/db/queries/knowledge-embeddings";
import { embeddingsEnabled } from "@/lib/rag/embeddings";

async function reindexProjectProfile(userId: string, projectKey: string): Promise<void> {
  if (!embeddingsEnabled()) return;
  const ctx = await getProjectContext(userId, projectKey).catch(() => null);
  if (!ctx?.trim()) return;
  await upsertKnowledge(userId, {
    sourceType: "project_profile",
    sourceId: projectKey,
    chunk: ctx.slice(0, 6000),
    metadata: { project: projectKey },
  });
}

/** Look up project name by entity id, then reindex. No-op when RAG is off. */
export async function reindexProjectProfileByEntityId(userId: string, entityId: string): Promise<void> {
  if (!embeddingsEnabled()) return;
  const row = await db.query.entities.findFirst({
    where: and(eq(entities.id, entityId), eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)),
    columns: { name: true },
  });
  if (!row?.name) return;
  await reindexProjectProfile(userId, row.name);
}

/** Schedule a profile reindex without blocking the caller. */
export function scheduleProjectProfileReindex(userId: string, projectKey: string): void {
  if (!embeddingsEnabled()) return;
  void reindexProjectProfile(userId, projectKey).catch((err) => {
    console.error("[reindex-project-profile] failed:", err instanceof Error ? err.message : err);
  });
}

export function scheduleProjectProfileReindexByEntityId(userId: string, entityId: string): void {
  if (!embeddingsEnabled()) return;
  void reindexProjectProfileByEntityId(userId, entityId).catch((err) => {
    console.error("[reindex-project-profile] failed:", err instanceof Error ? err.message : err);
  });
}
