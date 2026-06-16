import { type NextRequest, NextResponse } from "next/server";
import { logDebug } from "@/db/queries/debug-logs";
import { deleteStaleEventStreamTokens } from "@/db/queries/agent-tokens";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Cron job target — fires daily (see scripts/install-hetzner-crons.sh).
 *
 * Deletes event-stream agent tokens that haven't been touched in 30 days.
 * These tokens are minted per browser session via /api/event-stream-token
 * to authenticate the SSE bridge connection. Pre-2026-06-07 that endpoint
 * minted unconditionally on every call (one user accumulated 10 tokens in
 * 36 hours during DB inspection); a follow-up commit made it reuse-aware,
 * but legacy stale rows + the long tail of inactive sessions still need
 * a cleanup pass.
 *
 * Why only event-stream tokens: other labels (e.g. "Fleet Runner (auto)",
 * user-named tokens from Settings) represent persistent integrations.
 * Deleting them would silently break the runner. The pruner stays narrow
 * by label so future token kinds with different retention policies don't
 * accidentally fall under this scythe.
 *
 * Auth: same Bearer/dev pattern as prune-debug-logs (see @/lib/cron-auth).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const deleted = await deleteStaleEventStreamTokens();
    // Heartbeat — same pattern as prune-debug-logs. Fire-and-forget.
    logDebug({
      source: "api/crons/prune-agent-tokens",
      level: "info",
      message: `Pruned ${deleted} stale event-stream tokens`,
      meta: { deleted },
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logDebug({
      source: "api/crons/prune-agent-tokens",
      level: "error",
      message: `Token pruner failed: ${message}`,
      meta: {},
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
