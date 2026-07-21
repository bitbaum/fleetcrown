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
import { searchKnowledge, type KnowledgeHit } from "@/db/queries/knowledge-embeddings";
import { embeddingsEnabled } from "@/lib/rag/embeddings";
import { buildFleetIndex } from "@/lib/loki-fleet-index";
import { fetchOpenDemand, buildDemandBlock, searchEconomy, buildEconomySearchBlock } from "@/lib/integrations/orangecat-demand";
import type { UserProject } from "@/db/schema/user-projects";

const RAG_K = 6;
const RAG_POOL = 16;
const PER_SOURCE_CAP = 2;
const RAG_CHUNK_MAX = 300;

/** The key a hit belongs to for diversity — its project, or essay slug. */
function diversityKey(h: KnowledgeHit): string {
  return (h.metadata?.project as string | undefined) || (h.metadata?.slug as string | undefined) || h.sourceId;
}

/**
 * Spread retrieval across projects/essays: from a larger similarity-ranked pool,
 * take the top hits but cap how many come from any single source. Stops a
 * cross-project question ("how do these fit together") from returning six chunks
 * of one project and nothing of the others.
 */
function diversify(pool: KnowledgeHit[]): KnowledgeHit[] {
  const seen = new Map<string, number>();
  const picked: KnowledgeHit[] = [];
  for (const h of pool) {
    const key = diversityKey(h);
    const n = seen.get(key) ?? 0;
    if (n >= PER_SOURCE_CAP) continue;
    seen.set(key, n + 1);
    picked.push(h);
    if (picked.length >= RAG_K) break;
  }
  return picked;
}

/** RAG depth: diverse top-K relevant chunks across ALL projects for the query. */
async function buildRetrievedDetail(userId: string, query: string): Promise<string> {
  if (!embeddingsEnabled() || !query.trim()) return "";
  const pool = await searchKnowledge(userId, query, { k: RAG_POOL }).catch(() => []);
  if (pool.length === 0) return "";
  const hits = diversify(pool);
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
  // Fleet breadth + RAG depth (the operator's own work) alongside live economy
  // demand from OrangeCat (what to build for). Demand is best-effort — a slow or
  // down OrangeCat degrades to plain fleet context, never blocks the turn.
  const [detail, demand, econMatches] = await Promise.all([
    buildRetrievedDetail(userId, query),
    fetchOpenDemand().then(buildDemandBlock).catch(() => ""),
    searchEconomy(query).catch(() => []),
  ]);
  const index = buildFleetIndex(projects);
  const econSearch = buildEconomySearchBlock(econMatches);
  if (!index && !detail && !demand && !econSearch) return "";
  return [
    "## Fleet context (read-only background — the operator's current projects)",
    "Use this to answer accurately and specifically about the operator's work. It is current state, NOT part of the conversation — and NOT something to repeat back. Never restate, summarise, or list this context to the user; answer their actual question directly and concisely, citing specific projects. If a question falls outside this context, say so rather than guessing.",
    index,
    detail,
    econSearch,
    demand,
  ].filter(Boolean).join("\n\n");
}
