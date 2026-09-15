// Cron — feedback that Needs you announces itself on Telegram.
//
// Implement that never got a PTY, a stalled agent, or a fix waiting for
// Check live / Confirm used to sit silent until someone opened Feedback.
// Boss-mode: ping when the flag goes up (same raise/refresh/resolve pattern
// as check-pending-approvals).
//
// Schedule: every 15 min at :05 (systemd timer, scripts/install-hetzner-crons.sh).

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { syncFeedbackNeedsYou } from "@/lib/feedback/notify-needs-you";
import { autoRetryStuckFeedbackQueues } from "@/lib/feedback/retry-queued";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const retry = await autoRetryStuckFeedbackQueues();
  const result = await syncFeedbackNeedsYou();
  const didSomething =
    retry.retried > 0 || result.raised > 0 || result.pinged > 0 || result.cleared > 0;
  await logDebug({
    source: "crons/check-feedback-needs-you",
    level: didSomething ? "warn" : "info",
    message: `users ${result.users}: raised ${result.raised}, pinged ${result.pinged}, cleared ${result.cleared}`,
    meta: { ...result, retry },
  });
  return NextResponse.json({ ok: true, ...result, retry });
}
