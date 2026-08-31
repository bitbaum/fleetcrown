/**
 * Collapse same-work Loki threads so history is a resume list, not a wall.
 * "move forward on fleetcrown" ×15 is one row. Newest (or the active thread)
 * is the head; count is how many siblings it stands for.
 */

export type ConversationGroupable = {
  id: string;
  title: string;
  projectKeys: string[];
};

export type ConversationGroup<T extends ConversationGroupable> = {
  head: T;
  count: number;
};

export const LOKI_HISTORY_VISIBLE = 12;

export function normalizeConversationTitle(title: string): string {
  const t = title.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^move .+ toward its active goal/.test(t) || /^move forward\b/.test(t)) return "move-forward";
  if (/^next best\b/.test(t)) return "next-best";
  if (/^code review\b/.test(t)) return "code-review";
  if (/^fix (types|tests|types and tests)\b/.test(t)) return "fix-tests";
  if (/^review the ui\b/.test(t)) return "review-ui";
  return t;
}

export function conversationGroupKey(c: ConversationGroupable): string {
  const projects = [...c.projectKeys]
    .map((k) => k.toLowerCase())
    .sort()
    .join(",");
  return `${normalizeConversationTitle(c.title)}::${projects}`;
}

export function groupConversations<T extends ConversationGroupable>(
  conversations: T[],
  activeId: string | null = null,
): ConversationGroup<T>[] {
  const buckets = new Map<string, T[]>();
  const order: string[] = [];
  for (const c of conversations) {
    const key = conversationGroupKey(c);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(c);
      continue;
    }
    buckets.set(key, [c]);
    order.push(key);
  }
  return order.map((key) => {
    const items = buckets.get(key)!;
    const head = (activeId && items.find((item) => item.id === activeId)) || items[0];
    return { head, count: items.length };
  });
}

export function visibleConversationGroups<T extends ConversationGroupable>(
  groups: ConversationGroup<T>[],
  limit = LOKI_HISTORY_VISIBLE,
): { visible: ConversationGroup<T>[]; hidden: number } {
  if (groups.length <= limit) return { visible: groups, hidden: 0 };
  return { visible: groups.slice(0, limit), hidden: groups.length - limit };
}
