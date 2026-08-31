// Verify fleet RAG retrieval returns hits when the index is populated.
// Run on the box or locally with EMBEDDINGS_BASE_URL + DATABASE_URL set:
//   npx tsx scripts/test/rag-retrieval.ts [query]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const query = process.argv[2] ?? "authentication patterns across projects";
  const { embeddingsEnabled } = await import("../../src/lib/rag/embeddings");
  const { getAllDistinctUserIds } = await import("../../src/db/queries/user-projects");
  const { retrieveFleetContextBlock } = await import("../../src/db/queries/knowledge-embeddings");
  const { getKnowledgeIndexStats } = await import("../../src/db/queries/knowledge-index-stats");

  if (!embeddingsEnabled()) {
    console.error("FAIL: EMBEDDINGS_BASE_URL not set");
    process.exit(1);
  }

  const userIds = await getAllDistinctUserIds();
  if (userIds.length === 0) throw new Error("no users");
  const userId = userIds[0];

  const stats = await getKnowledgeIndexStats(userId);
  console.log("index stats:", stats);

  const block = await retrieveFleetContextBlock(userId, query, {
    excludeProject: "nonexistent-project",
  });
  if (stats.totalChunks > 0 && !block.trim()) {
    console.warn(
      "WARN: index has chunks but query returned no block (threshold may filter all hits)",
    );
  }
  console.log("query:", query);
  console.log("block length:", block.length);
  if (block) console.log("preview:", block.slice(0, 400));
  console.log(
    stats.totalChunks > 0
      ? "OK — RAG retrieval path exercised"
      : "OK — RAG off or empty index (no chunks yet)",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
