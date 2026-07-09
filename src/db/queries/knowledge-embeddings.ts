import { db } from "@/db";
import { sql } from "drizzle-orm";
import { embedText, embedTexts, toVectorLiteral, embeddingsEnabled } from "@/lib/rag/embeddings";

export type KnowledgeSourceType =
  | "project_profile" | "dev_log" | "goal" | "orchestration_outcome" | "decision" | "entity" | "commitment" | "thought";

export type KnowledgeItem = {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  chunk: string;
  metadata?: Record<string, unknown>;
};

export type KnowledgeHit = {
  sourceType: string;
  sourceId: string;
  chunk: string;
  similarity: number;
  metadata: Record<string, unknown>;
};

/** Embed + upsert a batch of chunks for one user. Returns how many landed. */
export async function upsertKnowledgeBatch(userId: string, items: KnowledgeItem[]): Promise<number> {
  if (!embeddingsEnabled() || items.length === 0) return 0;
  const vecs = await embedTexts(items.map((i) => i.chunk));
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    const vec = vecs[i];
    if (!vec) continue;
    const it = items[i];
    await db.execute(sql`
      INSERT INTO knowledge_embeddings (user_id, source_type, source_id, chunk, embedding, metadata, updated_at)
      VALUES (${userId}, ${it.sourceType}, ${it.sourceId}, ${it.chunk}, ${toVectorLiteral(vec)}::vector, ${JSON.stringify(it.metadata ?? {})}::jsonb, now())
      ON CONFLICT (user_id, source_type, source_id)
      DO UPDATE SET chunk = EXCLUDED.chunk, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, updated_at = now()
    `);
    n++;
  }
  return n;
}

/** Convenience single-chunk upsert (embed-on-write callers). */
export async function upsertKnowledge(userId: string, item: KnowledgeItem): Promise<void> {
  await upsertKnowledgeBatch(userId, [item]);
}

/**
 * Delete all of a user's rows for the given source types. The reindexer calls
 * this before a full rebuild so chunk-id changes (e.g. re-chunking essays) and
 * deleted projects/essays leave no orphan rows — the index is a true mirror,
 * not an append-only pile. Scoped to types so embed-on-write sources survive.
 */
export async function deleteKnowledgeByTypes(userId: string, sourceTypes: KnowledgeSourceType[]): Promise<void> {
  if (sourceTypes.length === 0) return;
  const typeArray = sql`ARRAY[${sql.join(sourceTypes.map((t) => sql`${t}`), sql`, `)}]::text[]`;
  await db.execute(sql`DELETE FROM knowledge_embeddings WHERE user_id = ${userId} AND source_type = ANY(${typeArray})`);
}

/**
 * Retrieve top-K fleet-knowledge chunks for a query, scoped to one user.
 * Cosine distance via pgvector `<=>`; similarity = 1 - distance. Hard-thresholded
 * so off-topic rows don't pollute injected context.
 */
export async function searchKnowledge(
  userId: string,
  query: string,
  opts?: { k?: number; minSimilarity?: number; sourceTypes?: KnowledgeSourceType[] },
): Promise<KnowledgeHit[]> {
  if (!embeddingsEnabled() || !query.trim()) return [];
  const vec = await embedText(query);
  if (!vec) return [];
  const lit = toVectorLiteral(vec);
  const k = opts?.k ?? 6;
  const minSim = opts?.minSimilarity ?? 0.3;
  const typeFilter = opts?.sourceTypes?.length
    ? sql`AND source_type = ANY(${sql`ARRAY[${sql.join(opts.sourceTypes.map((t) => sql`${t}`), sql`, `)}]::text[]`})`
    : sql``;

  const rows = await db.execute<{
    source_type: string; source_id: string; chunk: string; metadata: Record<string, unknown>; similarity: number;
  }>(sql`
    SELECT source_type, source_id, chunk, metadata,
           1 - (embedding <=> ${lit}::vector) AS similarity
    FROM knowledge_embeddings
    WHERE user_id = ${userId} ${typeFilter}
    ORDER BY embedding <=> ${lit}::vector
    LIMIT ${k}
  `);

  return (rows as unknown as Array<{ source_type: string; source_id: string; chunk: string; metadata: Record<string, unknown>; similarity: number }>)
    .map((r) => ({ sourceType: r.source_type, sourceId: r.source_id, chunk: r.chunk, similarity: Number(r.similarity), metadata: r.metadata ?? {} }))
    .filter((h) => h.similarity >= minSim);
}

/**
 * Retrieve cross-project context for a dispatch and format it as an injectable
 * block. Excludes the project the task is FOR (its own profile is already
 * injected) — this is the captain's unique value: surfacing what other projects
 * learned. Returns "" when RAG is off or nothing's relevant (safe to concat).
 */
export async function retrieveFleetContextBlock(
  userId: string,
  query: string,
  opts?: { excludeProject?: string; k?: number },
): Promise<string> {
  if (!embeddingsEnabled() || !query.trim()) return "";
  const k = opts?.k ?? 4;
  const ex = opts?.excludeProject?.toLowerCase();
  const hits = await searchKnowledge(userId, query, { k: k + 3 }).catch(() => []);
  const filtered = hits
    .filter((h) => {
      const proj = ((h.metadata?.project as string | undefined) ?? h.sourceId).toLowerCase();
      return !ex || (proj !== ex && !proj.startsWith(`${ex}:`));
    })
    .slice(0, k);
  if (filtered.length === 0) return "";
  const lines = filtered.map(
    (h) => `- [${(h.metadata?.project as string) ?? h.sourceId}] ${h.chunk.replace(/\s+/g, " ").slice(0, 280)}`,
  );
  return [
    "## Relevant context from your other projects (retrieved)",
    "Patterns/decisions from across the fleet that may inform this task — reuse where they fit, ignore if not.",
    ...lines,
  ].join("\n");
}
