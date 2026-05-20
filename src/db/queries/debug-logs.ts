import { db } from "@/db";
import { debugLogs, type NewDebugLog } from "@/db/schema/debug-logs";
import { desc } from "drizzle-orm";

/**
 * Fire-and-forget logger. Never throws — a telemetry failure must not break
 * the user-facing operation it was observing. Returns the insert promise so
 * tests can await it, but callers should NOT await this in request handlers.
 */
export function logDebug(entry: Omit<NewDebugLog, "id" | "createdAt">): Promise<unknown> {
  return db.insert(debugLogs).values(entry).catch((err) => {
    // Telemetry failed — log to stderr as the absolute last resort.
    console.error("[debug-logs] insert failed:", err, "for entry:", { source: entry.source, level: entry.level, message: entry.message });
  });
}

/** Most-recent N debug log entries, newest first. UI helper for a future admin view. */
export async function getRecentDebugLogs(limit = 50) {
  return db.select().from(debugLogs).orderBy(desc(debugLogs.createdAt)).limit(limit);
}
