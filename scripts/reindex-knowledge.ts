// Backfill the fleet-knowledge vector index — everything Loki should know about
// the operator's work, in one searchable place:
//   project_profile (dossier) · dev_log · goal (roadmaps/task-lists) · thought
//   (the published strategic essays — how the projects relate).
//
// Run on the box (where pgvector + the embed server live):
//   EMBEDDINGS_BASE_URL=http://127.0.0.1:7997/v1 DATABASE_URL=… \
//     node_modules/.bin/tsx scripts/reindex-knowledge.ts
//
// Idempotent — upserts on (user_id, source_type, source_id). Safe to re-run.
// Later phases can add orchestration_outcome / decision / entity / commitment.

import { getAllDistinctUserIds, getUserProjects } from "@/db/queries/user-projects";
import { getProjectContext } from "@/db/queries/project-context";
import { getProjectDossierByProjectKey, renderProjectDossierForAgent } from "@/db/queries/project-dossier";
import { getGoals, type GoalWithChildren } from "@/db/queries/goals";
import { listThoughts } from "@/lib/thoughts-content";
import { upsertKnowledgeBatch, pruneKnowledgeToIds, type KnowledgeItem } from "@/db/queries/knowledge-embeddings";
import { chunkMarkdown } from "@/lib/rag/chunk";
import { embeddingsEnabled } from "@/lib/rag/embeddings";
import type { DevLogEntry } from "@/db/schema/user-projects";
import type { Milestone } from "@/db/schema/goals";

/** Flatten the goal tree (parents + nested children) into one list. */
function flattenGoals(nodes: GoalWithChildren[]): GoalWithChildren[] {
  const out: GoalWithChildren[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.children?.length) out.push(...flattenGoals(n.children));
  }
  return out;
}

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

    // goal: each project's roadmap / task list. What every project is trying to
    // achieve — the raw material for cross-project synthesis ("how do these fit
    // together"). entityName is the project the goal belongs to (joined query).
    const goals = await getGoals(userId).catch(() => [] as GoalWithChildren[]);
    for (const g of flattenGoals(goals)) {
      const ms = ((g.milestones as Milestone[] | null) ?? [])
        .map((m) => `${m.done ? "✓" : "○"} ${m.title}`).join("; ");
      const chunk = [
        `Goal${g.entityName ? ` for ${g.entityName}` : ""}: ${g.title}`,
        g.description ?? "",
        `Status: ${g.status} · ${g.progress ?? 0}% complete`,
        ms ? `Milestones: ${ms}` : "",
      ].filter(Boolean).join("\n");
      items.push({ sourceType: "goal", sourceId: `goal:${g.id}`, chunk: chunk.slice(0, 4000), metadata: { project: g.entityName ?? "", title: g.title } });
    }

    // thought: the published strategic essays. This is where the operator has
    // written down HOW the projects relate (three-layer thesis, the two halves,
    // etc.) — so Loki can reason about synergies from first-hand sources, not
    // guess. Split each essay into section-sized passages so retrieval returns
    // the relevant part, not a truncated whole. Global content, indexed per user
    // so per-user retrieval reaches it.
    for (const t of listThoughts()) {
      const passages = chunkMarkdown(t.body, { maxChars: 1400, prefix: `Essay: ${t.title}` });
      const chunks = passages.length ? passages : [`Essay: ${t.title}\n${t.summary}`];
      chunks.forEach((chunk, i) => {
        items.push({ sourceType: "thought", sourceId: `thought:${t.slug}#${i}`, chunk: chunk.slice(0, 2000), metadata: { title: t.title, slug: t.slug } });
      });
    }

    // Insert-first, prune-after: upsert the fresh set, then (only if it produced
    // rows) drop owned-type orphans not in it. Ordering matters — deleting first
    // would empty the index whenever the embed step fails (learned the hard way).
    const n = await upsertKnowledgeBatch(userId, items);
    if (n > 0) {
      await pruneKnowledgeToIds(userId, ["project_profile", "dev_log", "goal", "thought"], items.map((i) => i.sourceId));
    }
    totalChunks += n;
    console.log(`[reindex] user ${userId.slice(0, 8)}…: ${n}/${items.length} chunks (${projects.length} projects)`);
  }
  console.log(`[reindex] done — ${totalChunks} chunks indexed across ${userIds.length} user(s)`);
  process.exit(0);
}

main().catch((e) => { console.error("[reindex] failed:", e); process.exit(1); });
