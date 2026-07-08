// Backfill the fleet-knowledge vector index (P0: project profiles + dev-logs).
//
// Run on the box (where pgvector + the embed server live):
//   EMBEDDINGS_BASE_URL=http://127.0.0.1:7997/v1 DATABASE_URL=… \
//     node_modules/.bin/tsx scripts/reindex-knowledge.ts
//
// Idempotent — upserts on (user_id, source_type, source_id). Safe to re-run.
// Later phases add orchestration_outcome / decision / entity / commitment sources.

import { getAllDistinctUserIds, getUserProjects } from "@/db/queries/user-projects";
import { getProjectContext } from "@/db/queries/project-context";
import { getProjectDossierByProjectKey, renderProjectDossierForAgent } from "@/db/queries/project-dossier";
import { upsertKnowledgeBatch, type KnowledgeItem } from "@/db/queries/knowledge-embeddings";
import { embeddingsEnabled } from "@/lib/rag/embeddings";
import type { DevLogEntry } from "@/db/schema/user-projects";

async function main() {
  if (!embeddingsEnabled()) {
    console.error("[reindex] EMBEDDINGS_BASE_URL not set — nothing to do.");
    process.exit(1);
  }
  const userIds = await getAllDistinctUserIds();
  let totalChunks = 0;
  for (const userId of userIds) {
    const projects = await getUserProjects(userId);
    const items: KnowledgeItem[] = [];
    for (const p of projects) {
      // project_profile: the same rich context block we inject per dispatch.
      const dossier = await getProjectDossierByProjectKey(userId, p.name).catch(() => null);
      const ctx = dossier ? renderProjectDossierForAgent(dossier) : await getProjectContext(userId, p.name).catch(() => null);
      const profile = [p.name, p.description, p.stack, ctx].filter(Boolean).join("\n");
      if (profile.trim()) {
        items.push({ sourceType: "project_profile", sourceId: p.name, chunk: profile.slice(0, 6000), metadata: { project: p.name } });
      }
      // dev_log: the recent narrative of what's happening on the project.
      const log = (p.devLog as DevLogEntry[]) ?? [];
      const recent = log.slice(-8).map((e) => `${e.date}: ${e.done}${e.next ? ` → next: ${e.next}` : ""}`).join("\n");
      if (recent.trim()) {
        items.push({ sourceType: "dev_log", sourceId: `${p.name}:devlog`, chunk: `Dev log for ${p.name}:\n${recent}`.slice(0, 6000), metadata: { project: p.name } });
      }
    }
    const n = await upsertKnowledgeBatch(userId, items);
    totalChunks += n;
    console.log(`[reindex] user ${userId.slice(0, 8)}…: ${n}/${items.length} chunks (${projects.length} projects)`);
  }
  console.log(`[reindex] done — ${totalChunks} chunks indexed across ${userIds.length} user(s)`);
  process.exit(0);
}

main().catch((e) => { console.error("[reindex] failed:", e); process.exit(1); });
