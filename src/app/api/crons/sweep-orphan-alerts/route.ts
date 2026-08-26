// Cron target — keep the alert surface worth reading.
//
// THE FAULT
// ---------
// An alert type outlives the code that raised it. On 2026-08-26 ten alerts were
// open in production and FOUR were zombies: `bill_due`, `stale_relationship`,
// `overdue_commitment` and `stalled_goal`, raised between 2026-05-10 and
// 2026-06-23 by features that no longer exist. Nothing could refresh them,
// nothing could auto-resolve them, and `alerts` stores no "last confirmed"
// timestamp — so from the table alone a live alarm and a 108-day-old fossil are
// indistinguishable.
//
// WHY IT IS WORTH A CLOCK
// -----------------------
// Forty per cent of the surface was permanent noise, and the correct response
// to a list that is mostly wrong is to stop reading it. That is the same
// mechanism every alert here exists to defeat, aimed at the alerts themselves:
// a dead telemetry sensor and a runner twelve days behind were queued beneath
// three months of fossils. **A channel degrades to the reliability of its worst
// entry.**
//
// Doing it on a clock rather than in a migration is deliberate. A migration
// fixes the four that exist; a sweep means the NEXT retired feature cleans up
// after itself, instead of depending on whoever deletes it to remember rows
// they never thought about. Deletion as a consequence, not an act of will.
//
// SAFE BY CONSTRUCTION
// --------------------
// It only clears types absent from ALERT_TYPES — types no code can raise. No
// live condition can be hidden, because nothing is left that would raise it.
// The paired test (scripts/test/alert-registry.ts) enforces the other
// direction: every registered type must still have a producer, so retiring a
// feature turns CI red until its alert type is retired with it.
//
// Schedule: daily 06:55 UTC (scripts/install-hetzner-crons.sh), after the
// telemetry and runner-version checks that feed this same surface.

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { dismissUnregisteredAlerts, countOpenAlertsByType } from "@/db/queries/alerts";
import { isRegisteredAlertType } from "@/config/alert-types";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const cleared = await dismissUnregisteredAlerts();
  const remaining = await countOpenAlertsByType();

  // Anything still open that is NOT registered would mean the sweep failed to
  // do its one job — report it rather than assume the update succeeded.
  const stillOrphaned = remaining.filter((r) => !isRegisteredAlertType(r.type));

  const clearedCount = cleared.reduce((n, c) => n + c.count, 0);

  await logDebug({
    source: "crons/sweep-orphan-alerts",
    level: stillOrphaned.length > 0 ? "error" : clearedCount > 0 ? "warn" : "info",
    message:
      stillOrphaned.length > 0
        ? `SWEEP INCOMPLETE: ${stillOrphaned.map((r) => `${r.type}×${r.count}`).join(", ")} still open with no producer`
        : clearedCount > 0
          ? `Cleared ${clearedCount} orphaned alert(s): ${cleared.map((c) => `${c.type}×${c.count}`).join(", ")}`
          : `No orphaned alerts; ${remaining.reduce((n, r) => n + r.count, 0)} open alert(s), all with live producers`,
    meta: { cleared, remaining },
  });

  return NextResponse.json({
    ok: stillOrphaned.length === 0,
    cleared,
    clearedCount,
    remaining,
  });
}
