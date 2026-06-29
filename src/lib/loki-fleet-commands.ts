/**
 * Deterministic fleet-aware NL handlers for the Loki messages route.
 * These run before resolveCommand() so "list my projects" and "create project X"
 * never hit OpenClaw web search or a mis-routed dispatch.
 */
import type { UserProject } from "@/db/schema";
import { normalizeProjectName } from "@/lib/project-name";

const LIST_PROJECTS_RE =
  /\b(list|show|name|tell me)\b.*\b(my )?(projects?|fleet)\b|\b(what|which)\s+projects?\b|\bprojects?\s+do\s+i\s+have\b/i;

const CREATE_WITH_NAME_RE =
  /\bcreate(?:\s+a|\s+an|\s+the|\s+new)?\s+(?:project|entity)(?:\s+(?:called|named|for))?\s+(.+)/i;

const CREATE_GENERIC_RE =
  /\bcreate(?:\s+a|\s+an|\s+the|\s+new)?\s+(?:project|entity)\b(?:\s+and\b|\s*$)/i;

const DISPATCH_AFTER_CREATE_RE =
  /\b(let['']?s|and)\s+(go|develop|build|start|dispatch|run)\b|\bgo ahead\b/i;

export function isListProjectsQuery(text: string): boolean {
  return LIST_PROJECTS_RE.test(text.trim());
}

export function formatProjectList(projects: UserProject[]): string {
  if (projects.length === 0) {
    return "You don't have any projects yet. Say **create project my-app** to register one.";
  }
  const lines = projects.map((p) => `- **${p.name}**${p.description ? ` — ${p.description}` : ""}`);
  return [
    `Your fleet (${projects.length} project${projects.length === 1 ? "" : "s"}):`,
    "",
    ...lines,
    "",
    "Select one on the right, name it in your message, or say **code review for `<project>`**.",
  ].join("\n");
}

export type CreateProjectRequest = {
  /** Normalized slug when the user named it; null when they said "create entity and go". */
  name: string | null;
  dispatchAfter: boolean;
};

export function parseCreateProjectRequest(text: string): CreateProjectRequest | null {
  const trimmed = text.trim();
  const named = trimmed.match(CREATE_WITH_NAME_RE);
  if (named) {
    const raw = named[1].replace(/\s+(and|then)\s+.*$/i, "").trim();
    const slug = normalizeProjectName(raw);
    if (!slug) return null;
    return { name: slug, dispatchAfter: DISPATCH_AFTER_CREATE_RE.test(trimmed) };
  }
  if (CREATE_GENERIC_RE.test(trimmed)) {
    return { name: null, dispatchAfter: DISPATCH_AFTER_CREATE_RE.test(trimmed) };
  }
  return null;
}

/** Fallback name when the user says "create entity and go" without naming it. */
export function projectNameFromConversationTitle(title: string): string | null {
  const slug = normalizeProjectName(title);
  return slug || null;
}
