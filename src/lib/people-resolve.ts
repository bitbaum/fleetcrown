import { searchPeople, type PersonWithAttributes } from "@/db/queries/people";
import { nameCandidates } from "@/lib/people-names";
import { reachChannels } from "@/lib/people-reach";
import type { ActionPayload } from "@/db/schema/actions";

export type ResolvedReach = {
  person: PersonWithAttributes;
  channel: "whatsapp" | "telegram" | "email" | "phone";
  address: string;
};

function scorePerson(p: PersonWithAttributes, q: string): number {
  const n = p.name.toLowerCase();
  const query = q.toLowerCase();
  if (n === query) return 100;
  if (n.startsWith(query)) return 80;
  if (n.split(/\s+/).some((w) => w.startsWith(query))) return 70;
  if (n.includes(query)) return 50;
  return 10;
}

/**
 * Pick the contact a write/message request is about.
 * Prefers a name that starts with the hint, then most-recent interaction.
 */
export async function resolvePersonToReach(
  userId: string,
  hint: string | undefined,
  rawMessage?: string,
): Promise<PersonWithAttributes | null> {
  const queries = [
    ...(hint?.trim() ? [hint.trim()] : []),
    ...nameCandidates(rawMessage ?? hint ?? ""),
  ];
  const seen = new Set<string>();
  const found: PersonWithAttributes[] = [];
  for (const q of queries) {
    const hit = await searchPeople(userId, q, 8).catch(() => null);
    for (const p of hit?.people ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      found.push(p);
    }
  }
  if (found.length === 0) return null;
  const primary = (hint ?? queries[0] ?? "").trim();
  found.sort((a, b) => {
    const ds = scorePerson(b, primary) - scorePerson(a, primary);
    if (ds !== 0) return ds;
    const at = a.lastInteraction ? new Date(a.lastInteraction).getTime() : 0;
    const bt = b.lastInteraction ? new Date(b.lastInteraction).getTime() : 0;
    return bt - at;
  });
  return found[0] ?? null;
}

export function reachFromPerson(person: PersonWithAttributes): ResolvedReach | null {
  const channels = reachChannels(person.attrs);
  const order = ["whatsapp", "telegram", "email", "phone"] as const;
  for (const kind of order) {
    const hit = channels.find((c) => c.label.toLowerCase() === kind);
    if (hit) return { person, channel: kind, address: hit.value };
  }
  return null;
}

/** Attach the real person + channel onto a send_message / send_email payload. */
export function enrichReachPayload(
  payload: ActionPayload | null | undefined,
  resolved: ResolvedReach | null,
): ActionPayload {
  const base = { ...(payload ?? {}) };
  if (!resolved) return base;
  return {
    ...base,
    to: resolved.person.name,
    channel: resolved.channel,
    address: resolved.address,
  };
}
