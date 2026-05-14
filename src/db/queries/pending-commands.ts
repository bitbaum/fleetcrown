import { db } from "@/db";
import { pendingCommands, type NewPendingCommand, type InjectPayload } from "@/db/schema/pending-commands";
import { eq, isNull, and } from "drizzle-orm";

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

// Used by the local daemon: claims the next unclaimed command for this user.
export async function claimNextPendingCommand(userId: string) {
  const [row] = await db
    .select()
    .from(pendingCommands)
    .where(and(eq(pendingCommands.userId, userId), isNull(pendingCommands.claimedAt)))
    .orderBy(pendingCommands.createdAt)
    .limit(1);

  if (!row) return null;

  await db
    .update(pendingCommands)
    .set({ claimedAt: new Date() })
    .where(eq(pendingCommands.id, row.id));

  return row;
}

export async function markCommandExecuted(
  id: string,
  result: { ok: boolean; error?: string },
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
