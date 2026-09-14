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
import { syncFeedbackNeedsYou } from "@/lib/feedback/notify-needs-you";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const result = await syncFeedbackNeedsYou();
  return NextResponse.json({ ok: true, ...result });
}
