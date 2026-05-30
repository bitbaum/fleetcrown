import { db } from "@/db";
import { pendingCommands, type NewPendingCommand, type InjectPayload, type SwitchAgentPayload, type AutoContinuePayload, type TabPayload, type LaunchAgentPayload } from "@/db/schema/pending-commands";
import { eq, isNull, isNotNull, and, inArray, desc, sql } from "drizzle-orm";
import type { FailedCommand } from "@/lib/control-types";

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

export async function enqueueAutoContinueCommand(
  userId: string,
  payload: AutoContinuePayload,
): Promise<string> {
  return enqueuePendingCommand({ userId, type: "auto_continue", payload });
}

export async function enqueueTabCommand(userId: string, type: "focus_tab" | "close_tab", payload: TabPayload): Promise<string> {
  return enqueuePendingCommand({ userId, type, payload });
}

export async function enqueueLaunchAgentCommand(userId: string, payload: LaunchAgentPayload): Promise<string> {
  return enqueuePendingCommand({ userId, type: "launch_agent", payload });
}

// Atomically claims the next unclaimed command for one or more already
// authorized user IDs. API bearer routes must pass only the token owner's ID.
// FOR UPDATE SKIP LOCKED prevents two concurrent pollers from claiming the same row.
const STALE_CLAIM_SECONDS = 90;

/** Commands claimed but never finished (daemon crash/restart) become claimable again. */
export async function reclaimStalePendingCommands(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  const reclaimed = await db
    .update(pendingCommands)
    .set({ claimedAt: null })
    .where(and(
      userFilter,
      isNotNull(pendingCommands.claimedAt),
      isNull(pendingCommands.executedAt),
      sql`${pendingCommands.claimedAt} < NOW() - INTERVAL '1 second' * ${STALE_CLAIM_SECONDS}`,
    ))
    .returning({ id: pendingCommands.id });
  return reclaimed.length;
}

export async function claimNextPendingCommand(userIds: string[]) {
  if (userIds.length === 0) return null;
  await reclaimStalePendingCommands(userIds);
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
  userId: string,
  result: { ok: boolean; text?: string; error?: string },
): Promise<boolean> {
  const updated = await db
    .update(pendingCommands)
    .set({ executedAt: new Date(), result })
    .where(and(eq(pendingCommands.id, id), eq(pendingCommands.userId, userId)))
    .returning({ id: pendingCommands.id });
  return updated.length > 0;
}

// Poll endpoint: returns pending (unclaimed) commands for a given user.
export async function getPendingCommandsForUser(userId: string) {
  return db
    .select()
    .from(pendingCommands)
    .where(and(eq(pendingCommands.userId, userId), isNull(pendingCommands.claimedAt)))
    .orderBy(pendingCommands.createdAt);
}

// Returns commands that were executed but reported ok=false in the last 10 minutes.
export async function getRecentFailedCommands(userIds: string[]): Promise<FailedCommand[]> {
  if (userIds.length === 0) return [];
  const userFilter = userIds.length === 1
    ? eq(pendingCommands.userId, userIds[0])
    : inArray(pendingCommands.userId, userIds);
  const rows = await db
    .select({
      id: pendingCommands.id,
      type: pendingCommands.type,
      payload: pendingCommands.payload,
      result: pendingCommands.result,
      executedAt: pendingCommands.executedAt,
    })
    .from(pendingCommands)
    .where(and(
      userFilter,
      isNotNull(pendingCommands.executedAt),
      sql`(${pendingCommands.result}->>'ok') = 'false'`,
      sql`${pendingCommands.executedAt} > NOW() - INTERVAL '10 minutes'`,
    ))
    .orderBy(desc(pendingCommands.executedAt))
    .limit(20);

  return rows
    .filter((r) => r.executedAt != null)
    .map((r) => ({
      id: r.id,
      tab: (r.payload as Record<string, unknown>)?.tab as string ?? "unknown",
      type: r.type,
      error: (r.result as Record<string, unknown>)?.error as string ?? "command failed",
      executedAt: r.executedAt!.toISOString(),
    }));
}
