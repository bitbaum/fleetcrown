import { type NextRequest, NextResponse } from "next/server";
import { logDebug, pruneDebugLogs } from "@/db/queries/debug-logs";

/**
 * Vercel Cron Job target — fires daily at 03:00 UTC (see vercel.json crons).
 *
 * Deletes debug_logs rows older than:
 *   - 30 days for level=info|warn (most rows; not useful long-term)
 *   - 90 days for level=error (postmortem value; longer retention)
 *
 * Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. If
 * CRON_SECRET is unset (local dev), the endpoint allows the call so devs
 * can run it manually with `curl localhost:3000/api/crons/prune-debug-logs`.
 *
 * Logs its own outcome into debug_logs (level=info) so we can see whether
 * the janitor actually fires every day in production.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const deleted = await pruneDebugLogs();
    // Fire-and-forget telemetry. Don't await — outcome doesn't depend on it.
    logDebug({
      source: "api/crons/prune-debug-logs",
      level: "info",
      message: `Pruned ${deleted} rows`,
      meta: { deleted },
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logDebug({
      source: "api/crons/prune-debug-logs",
      level: "error",
      message: `Janitor failed: ${message}`,
      meta: {},
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
