// Cron target — stale orchestration-run reaper.
//
// cleanupStaleOrchestrationRuns previously ran ONLY when someone loaded
// /api/control, so a dead run stayed "waiting" until the next human page
// view — in the 2026-07-02 dead-fleet incident, 16 runs lingered open for
// 51 hours and the outcome streak / autonomy stats saw nothing. A janitor
// that guards the truthfulness of run state cannot depend on a human
// happening to look; it runs on the clock.
//
// Schedule: hourly at :15 (systemd timer, scripts/install-hetzner-crons.sh),
// matching STALE_RUN_MINUTES=60 so a dead run is stamped within ~75 minutes.

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { cleanupStaleOrchestrationRuns } from "@/db/queries/orchestration-runs";
import { emitRunEvent } from "@/db/queries/run-events";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const reaped = await cleanupStaleOrchestrationRuns();
  for (const run of reaped) {
    // Run ledger: a reaped run's biography ends with an explicit timeout
    // verdict — the janitor declares the close like any other closer.
    void emitRunEvent(run.id, run.userId, "closed", { outcome: "timeout", by: "reaper" });
  }
  if (reaped.length > 0) {
    await logDebug({
      source: "crons/reap-stale-runs",
      level: "warn",
      message: `Reaped ${reaped.length} stale run(s) as timeout`,
      meta: { runs: reaped },
    });
  }
  return NextResponse.json({ ok: true, reaped: reaped.length });
}
