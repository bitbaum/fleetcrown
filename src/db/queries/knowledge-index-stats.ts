import { db } from "@/db";
import { knowledgeEmbeddings } from "@/db/schema/knowledge-embeddings";
import { desc, eq, sql } from "drizzle-orm";
import { embeddingsEnabled } from "@/lib/rag/embeddings";

export type KnowledgeIndexStats = {
  enabled: boolean;
  totalChunks: number;
  bySourceType: { sourceType: string; count: number }[];
  lastUpdatedAt: string | null;
};

/** Per-user fleet-knowledge vector index health for the Memory page. */
export async function getKnowledgeIndexStats(userId: string): Promise<KnowledgeIndexStats> {
  if (!embeddingsEnabled()) {
    return { enabled: false, totalChunks: 0, bySourceType: [], lastUpdatedAt: null };
  }

  try {
    const byType = await db
      .select({ sourceType: knowledgeEmbeddings.sourceType, count: sql<number>`count(*)::int` })
      .from(knowledgeEmbeddings)
      .where(eq(knowledgeEmbeddings.userId, userId))
      .groupBy(knowledgeEmbeddings.sourceType)
      .orderBy(sql`count(*) DESC`);

    const totalChunks = byType.reduce((s, r) => s + Number(r.count), 0);

    const [last] = await db
      .select({ updatedAt: knowledgeEmbeddings.updatedAt })
      .from(knowledgeEmbeddings)
      .where(eq(knowledgeEmbeddings.userId, userId))
      .orderBy(desc(knowledgeEmbeddings.updatedAt))
      .limit(1);

    return {
      enabled: true,
      totalChunks,
      bySourceType: byType.map((r) => ({ sourceType: r.sourceType, count: Number(r.count) })),
      lastUpdatedAt: last?.updatedAt?.toISOString() ?? null,
    };
  } catch {
    return { enabled: true, totalChunks: 0, bySourceType: [], lastUpdatedAt: null };
  }
}
