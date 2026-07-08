/**
 * Pure formatting of Loki's fleet index (BREADTH half of its project awareness).
 * Deliberately DB-free — imports only pure helpers + types — so it unit-tests in
 * the env-independent suite. The DB/RAG orchestration lives in loki-fleet-context.
 */
import { cleanDescription } from "@/lib/project-display";
import type { DevLogEntry, UserProject } from "@/db/schema/user-projects";

const INDEX_DESC_MAX = 140;
const INDEX_STATE_MAX = 160;

function latestDevLogState(project: UserProject): string | null {
  const log = (project.devLog as DevLogEntry[]) ?? [];
  const last = log[log.length - 1];
  if (!last?.done) return null;
  return `${last.date ? `${last.date}: ` : ""}${last.done}`.trim();
}

/** One compact line per project: name — stack — description — latest state. */
export function buildFleetIndex(projects: UserProject[]): string {
  if (projects.length === 0) return "";
  const lines = projects.map((p) => {
    const desc = cleanDescription(p.description);
    const state = latestDevLogState(p);
    const parts = [
      `- **${p.name}**`,
      p.stack ? `(${p.stack})` : "",
      desc ? `— ${desc.slice(0, INDEX_DESC_MAX)}` : "",
      state ? `· latest: ${state.replace(/\s+/g, " ").slice(0, INDEX_STATE_MAX)}` : "",
    ].filter(Boolean);
    return parts.join(" ");
  });
  return [`### Your projects (${projects.length} active)`, ...lines].join("\n");
}
