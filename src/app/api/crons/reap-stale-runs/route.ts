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
import { closeOpenRunsFromPushedState } from "@/lib/orchestration/close-sweep";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  // FIRST: close runs whose agents actually finished (pushed a ready handoff)
  // with their REAL outcome + DoD gate — unattended, no page load required.
  // Order matters: reap-first would stamp `partial`/`timeout` onto runs that
  // deserve their true verdict (the 2026-07-14 diagnosis: box autopilot worked
  // every night, but with no human loading /control the closes never fired and
  // 14 days of runs were recorded as failures).
  const swept = await closeOpenRunsFromPushedState().catch((e) => {
    console.error("[reap-stale-runs] close sweep failed:", e);
    return {
      checked: 0,
      closed: [] as Array<{ runId: string; projectKey: string; outcome: string }>,
    };
  });
  if (swept.closed.length > 0) {
    await logDebug({
      source: "crons/reap-stale-runs",
      level: "info",
      message: `Close-sweep closed ${swept.closed.length} run(s) from pushed handoffs`,
      meta: { closed: swept.closed },
    }).catch(() => {});
  }

  const reaped = await cleanupStaleOrchestrationRuns();
  for (const run of reaped) {
    // Run ledger: the janitor declares the close with the run's ACTUAL verdict
    // — `partial` when the agent had already written a handoff (worked, close
    // just didn't fire), `timeout` only when there was no evidence of work.
    void emitRunEvent(run.id, run.userId, "closed", {
      outcome: run.outcome ?? "timeout",
      by: "reaper",
    });
  }
  const partial = reaped.filter((r) => r.outcome === "partial").length;
  if (reaped.length > 0) {
    await logDebug({
      source: "crons/reap-stale-runs",
      level: "warn",
      message: `Reaped ${reaped.length} stale run(s): ${reaped.length - partial} timeout, ${partial} partial (agent had worked)`,
      meta: { runs: reaped },
    });
  }
  return NextResponse.json({
    ok: true,
    closed: swept.closed.length,
    reaped: reaped.length,
    partial,
  });
}
