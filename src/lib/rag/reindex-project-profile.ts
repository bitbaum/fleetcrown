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
import {
  getProjectDossierByProjectKey,
  renderProjectDossierForAgent,
} from "@/db/queries/project-dossier";
import { deleteKnowledgeSource, upsertKnowledge } from "@/db/queries/knowledge-embeddings";
import { embeddingsEnabled } from "@/lib/rag/embeddings";
import { skipForDemo } from "@/lib/demo-guard";

async function reindexProjectProfile(userId: string, projectKey: string): Promise<void> {
  if (!embeddingsEnabled()) return;
  // The demo may create and edit projects — that is most of what makes it worth
  // exploring — and each save schedules this. Embedding costs money per call, so
  // the demo skips it. SKIPS, not throws: this is fire-and-forget on the save
  // path, and a visitor who did nothing wrong should not see an error because a
  // background index declined to run. The single narrow cost of that: demo
  // projects are absent from RAG search, which the seed compensates for by
  // indexing its own fixtures once.
  if (await skipForDemo(userId)) return;
  const dossier = await getProjectDossierByProjectKey(userId, projectKey).catch(() => null);
  const ctx = dossier
    ? renderProjectDossierForAgent(dossier)
    : await getProjectContext(userId, projectKey).catch(() => null);
  if (!ctx?.trim()) return;
  await upsertKnowledge(userId, {
    sourceType: "project_profile",
    sourceId: projectKey,
    chunk: ctx.slice(0, 6000),
    metadata: { project: projectKey },
  });
}

/** Look up project name by entity id, then reindex. No-op when RAG is off. */
export async function reindexProjectProfileByEntityId(
  userId: string,
  entityId: string,
): Promise<void> {
  if (!embeddingsEnabled()) return;
  const row = await db.query.entities.findFirst({
    where: and(
      eq(entities.id, entityId),
      eq(entities.userId, userId),
      eq(entities.type, ENTITY_TYPE.PROJECT),
    ),
    columns: { name: true },
  });
  if (!row?.name) return;
  await reindexProjectProfile(userId, row.name);
}

export function scheduleProjectProfileReindexByEntityId(userId: string, entityId: string): void {
  if (!embeddingsEnabled()) return;
  void reindexProjectProfileByEntityId(userId, entityId).catch((err) => {
    console.error("[reindex-project-profile] failed:", err instanceof Error ? err.message : err);
  });
}

/** Reindex under the current name, then retire the old key. Insert-first keeps
 * the previous embedding available if the embedding service is temporarily down. */
export function scheduleRenamedProjectProfileReindex(
  userId: string,
  entityId: string,
  previousProjectKey: string,
): void {
  if (!embeddingsEnabled()) return;
  void (async () => {
    const row = await db.query.entities.findFirst({
      where: and(
        eq(entities.id, entityId),
        eq(entities.userId, userId),
        eq(entities.type, ENTITY_TYPE.PROJECT),
      ),
      columns: { name: true },
    });
    if (!row?.name) return;
    await reindexProjectProfile(userId, row.name);
    if (row.name.toLocaleLowerCase() !== previousProjectKey.toLocaleLowerCase()) {
      await deleteKnowledgeSource(userId, "project_profile", previousProjectKey);
    }
  })().catch((err) => {
    console.error(
      "[reindex-project-profile] rename failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

/** Remove a deleted project's cross-project memory row. Exact project context
 * disappears with the entity itself; this prevents similarity search from
 * continuing to cite a project that no longer exists. */
export function scheduleDeletedProjectProfileRemoval(userId: string, projectKey: string): void {
  if (!embeddingsEnabled()) return;
  void deleteKnowledgeSource(userId, "project_profile", projectKey).catch((err) => {
    console.error(
      "[reindex-project-profile] delete failed:",
      err instanceof Error ? err.message : err,
    );
  });
}
