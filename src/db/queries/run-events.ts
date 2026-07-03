import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runEvents, type NewRunEvent, type RunEventKind } from "@/db/schema/run-events";

/**
 * Append one hop to the run ledger. Fire-and-forget at call sites (never
 * block or fail the hop itself because telemetry hiccuped) — but callers
 * should `void emitRunEvent(...)` explicitly so intent is visible.
 */
export async function emitRunEvent(
  runId: string,
  userId: string,
  kind: RunEventKind,
  detail?: Record<string, unknown>,
): Promise<void> {
  const row: NewRunEvent = { runId, userId, kind, detail: detail ?? null };
  await db.insert(runEvents).values(row).catch((err) => {
    console.error("[run-events] emit failed:", kind, runId, err);
  });
}

/** Full ledger for one run, oldest first — the run's biography. */
export async function getRunEvents(runId: string) {
  return db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.createdAt));
}
