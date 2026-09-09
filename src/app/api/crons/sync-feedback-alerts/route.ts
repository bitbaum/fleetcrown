// Cron target — keep feedback alerts in sync with open feedback.
//
// WHY THIS EXISTS
// The bell only showed alerts for NEW feedback filings, but existing feedback
// sitting in the inbox never appeared. An operator who had filed feedback
// themselves saw no badge and no list when clicking the bell.
//
// This cron runs periodically to sync the alert store with the actual feedback
// queue: one alert per user summarizing their open feedback count (new +
// dispatched items), with a link to the full inbox.
//
// Schedule: every 15 minutes (systemd timer, scripts/install-hetzner-crons.sh).

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { syncFeedbackAlerts } from "@/lib/feedback/sync-alerts";

export async function GET(req: NextRequest) {
  const authResult = requireCronAuth(req);
  if (authResult) return authResult;

  try {
    const { synced, cleared } = await syncFeedbackAlerts();

    void logDebug({
      source: "crons/sync-feedback-alerts",
      level: "info",
      message: `Synced ${synced} feedback alert(s), cleared ${cleared}`,
    });

    return NextResponse.json({
      ok: true,
      synced,
      cleared,
    });
  } catch (e) {
    void logDebug({
      source: "crons/sync-feedback-alerts",
      level: "error",
      message: `Sync failed: ${(e as Error).message}`,
    });

    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
      },
      { status: 500 },
    );
  }
}
