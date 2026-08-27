import { type NextRequest, NextResponse } from "next/server";
import { logDebug, pruneDebugLogs } from "@/db/queries/debug-logs";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Cron job target — fires daily at 03:00 UTC (see scripts/install-hetzner-crons.sh).
 *
 * Deletes debug_logs rows older than:
 *   - 30 days for level=info|warn (most rows; not useful long-term)
 *   - 90 days for level=error (postmortem value; longer retention)
 *
 * Auth via requireCronAuth (SSOT in @/lib/cron-auth): fails closed in
 * production when CRON_SECRET unset, requires Bearer header when set,
 * allows direct curl in local dev. Logs its own outcome to debug_logs so
 * production has a daily heartbeat of whether the cron fires.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const deleted = await pruneDebugLogs();
    // Fire-and-forget telemetry. Don't await — outcome doesn't depend on it.
    logDebug({
      source: "crons/prune-debug-logs",
      level: "info",
      message: `Pruned ${deleted} rows`,
      meta: { deleted },
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logDebug({
      source: "crons/prune-debug-logs",
      level: "error",
      message: `Janitor failed: ${message}`,
      meta: {},
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
