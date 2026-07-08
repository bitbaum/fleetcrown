/**
 * Loki's fleet awareness — the context that makes Loki "on top of all projects".
 *
 * Two layers, prepended to every Loki turn (see loki-core.askLoki):
 *   1. Fleet index (BREADTH) — every active project, one compact line each with
 *      its latest dev-log state. Always present, so Loki can answer "across all
 *      my projects" comprehensively, not just whatever RAG happened to retrieve.
 *   2. Retrieved detail (DEPTH) — top-K semantically-relevant chunks from the
 *      fleet-knowledge vector index (pgvector; project dossiers + dev logs),
 *      scoped to the query. This is the RAG half — deep, current, on-topic.
 *
 * Unlike the dispatch path (retrieveFleetContextBlock excludes the target
 * project), Loki wants EVERY project — it is the captain's single point of view
 * over the whole fleet. Returns "" when there's nothing to say (no projects and
 * RAG off/empty), so callers can concat safely.
 */
import { getUserProjects } from "@/db/queries/user-projects";
import { searchKnowledge } from "@/db/queries/knowledge-embeddings";
import { embeddingsEnabled } from "@/lib/rag/embeddings";
import { buildFleetIndex } from "@/lib/loki-fleet-index";
import type { UserProject } from "@/db/schema/user-projects";

const RAG_K = 6;
const RAG_CHUNK_MAX = 300;

/** RAG depth: top-K relevant chunks across ALL projects for the query. */
async function buildRetrievedDetail(userId: string, query: string): Promise<string> {
  if (!embeddingsEnabled() || !query.trim()) return "";
  const hits = await searchKnowledge(userId, query, { k: RAG_K }).catch(() => []);
  if (hits.length === 0) return "";
  // Source-aware labels so Loki cites where each fact came from — a companion
  // that shows its work. Kind + project (or essay title) precede the chunk.
  const lines = hits.map((h) => {
    const project = (h.metadata?.project as string | undefined) ?? "";
    const title = (h.metadata?.title as string | undefined) ?? "";
    let label: string;
    switch (h.sourceType) {
      case "thought": label = `essay: ${title || h.sourceId}`; break;
      case "goal":    label = `${project || "goal"} · goal${title ? `: ${title}` : ""}`; break;
      case "dev_log": label = `${project} · dev log`; break;
      default:        label = project || h.sourceId; // project_profile / dossier
    }
    return `- [${label}] ${h.chunk.replace(/\s+/g, " ").slice(0, RAG_CHUNK_MAX)}`;
  });
  return ["### Relevant detail (retrieved from your project knowledge — cite the [source] when you use it)", ...lines].join("\n");
}

/**
 * Assemble Loki's read-only fleet context for a user + query. Breadth (all
 * projects) + depth (RAG). Empty string when there's nothing to inject.
 */
export async function buildLokiFleetContext(userId: string, query: string): Promise<string> {
  const projects = await getUserProjects(userId).catch(() => [] as UserProject[]);
  const [index, detail] = [buildFleetIndex(projects), await buildRetrievedDetail(userId, query)];
  if (!index && !detail) return "";
  return [
    "## Fleet context (read-only background — the operator's current projects)",
    "Use this to answer accurately and specifically about the operator's work. It is current state, not part of the conversation. If a question falls outside it, say so rather than guessing.",
    index,
    detail,
  ].filter(Boolean).join("\n\n");
}
