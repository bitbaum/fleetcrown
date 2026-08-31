import { db } from "@/db";
import { agentMessages, type NewAgentMessageRow } from "@/db/schema/agent-messages";
import { and, desc, eq } from "drizzle-orm";
import type { AgentMessage } from "@/lib/agent-comms";

/**
 * Ingest a batch of parsed messages for a user, idempotently. The runner
 * re-pushes the same tail each heartbeat, so duplicates (same userId+msgId)
 * are dropped. Returns how many were genuinely new.
 */
export async function ingestAgentMessages(
  userId: string,
  messages: AgentMessage[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const rows: NewAgentMessageRow[] = messages.map((m) => ({
    userId,
    msgId: m.id,
    fromAgent: m.from,
    toAgent: m.to,
    type: m.type ?? null,
    status: m.status ?? null,
    re: m.re || null,
    body: m.body,
    read: m.read,
    ts: m.ts,
  }));
  const inserted = await db
    .insert(agentMessages)
    .values(rows)
    .onConflictDoNothing({ target: [agentMessages.userId, agentMessages.msgId] })
    .returning({ id: agentMessages.id });
  return inserted.length;
}

/** The user's coordination feed, newest first, mapped back to the AgentMessage shape. */
export async function listAgentMessages(userId: string, limit = 100): Promise<AgentMessage[]> {
  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.userId, userId))
    .orderBy(desc(agentMessages.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.msgId,
    ts: r.ts,
    from: r.fromAgent,
    to: r.toAgent,
    re: r.re ?? "",
    body: r.body,
    read: r.read,
    type: (r.type as AgentMessage["type"]) ?? undefined,
    status: (r.status as AgentMessage["status"]) ?? undefined,
  }));
}

/** Mark a message read (feed interaction). Best-effort, owner-scoped. */
export async function markAgentMessageRead(userId: string, msgId: string): Promise<void> {
  await db
    .update(agentMessages)
    .set({ read: true })
    .where(and(eq(agentMessages.userId, userId), eq(agentMessages.msgId, msgId)));
}
