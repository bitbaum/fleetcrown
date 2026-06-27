/** Default visible rows before "Show all" on the Projects list. */
export const PROJECTS_LIST_CHUNK = 25;

const KNOWN_STATUS_HEADS = new Set([
  "active",
  "production",
  "live",
  "launched",
  "planning",
  "pre-launch",
  "blueprint",
  "early",
  "in-progress",
  "development",
  "paused",
  "archived",
  "deprecated",
]);

/** Show badge only for recognized lifecycle statuses. */
export function shortProjectStatus(status: string | undefined | null, maxLen = 28): string | null {
  if (!status?.trim()) return null;
  const s = status.trim();
  const head = s.match(/^(.{3,}?)(?:\s[—–-]\s|[,:(\[])/)?.[1]?.trim() ?? s;
  const normalized = head.toLowerCase();
  const isKnown = [...KNOWN_STATUS_HEADS].some((k) => normalized.startsWith(k));
  if (!isKnown) return null;
  if (head.length > maxLen) return `${head.slice(0, maxLen - 1)}…`;
  return head;
}

export { mergeDuplicateProjectRows } from "@/lib/domain/project-canonical";
