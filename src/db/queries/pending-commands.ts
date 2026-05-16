import { db } from "@/db";
import { pendingCommands, type NewPendingCommand, type InjectPayload, type SwitchAgentPayload } from "@/db/schema/pending-commands";
import { eq, isNull, and, inArray } from "drizzle-orm";

export async function getCommandById(id: string) {
  const [row] = await db.select().from(pendingCommands).where(eq(pendingCommands.id, id)).limit(1);
  return row ?? null;
}

export async function enqueuePendingCommand(
  command: Omit<NewPendingCommand, "id" | "createdAt">,
): Promise<string> {
  const [row] = await db.insert(pendingCommands).values(command).returning({ id: pendingCommands.id });
  return row.id;
}

export async function enqueueInjectCommand(
  userId: string,
  payload: InjectPayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "inject", payload });
}

export async function enqueueSwitchAgentCommand(
  userId: string,
  payload: SwitchAgentPayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "switch_agent", payload });
}

// Used by the local daemon: atomically claims the next unclaimed command for any of the given userIds.
// Accepts an array so the daemon can drain commands for all registered users (not just isDefault).
// FOR UPDATE SKIP LOCKED prevents two concurrent pollers from claiming the same row.
export async function claimNextPendingCommand(userIds: string[]) {
  if (userIds.length === 0) return null;
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(pendingCommands)
      .where(and(userFilter, isNull(pendingCommands.claimedAt)))
      .orderBy(pendingCommands.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx
      .update(pendingCommands)
      .set({ claimedAt: new Date() })
      .where(eq(pendingCommands.id, row.id));
    return row;
  });
}

export async function markCommandExecuted(
  id: string,
  result: { ok: boolean; text?: string; error?: string },
): Promise<void> {
  await db
    .update(pendingCommands)
    .set({ executedAt: new Date(), result })
    .where(eq(pendingCommands.id, id));
}

// Poll endpoint: returns pending (unclaimed) commands for a given user.
export async function getPendingCommandsForUser(userId: string) {
  return db
    .select()
    .from(pendingCommands)
    .where(and(eq(pendingCommands.userId, userId), isNull(pendingCommands.claimedAt)))
    .orderBy(pendingCommands.createdAt);
}
