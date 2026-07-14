// Cron target — revert lapsed OrangeCat/BTC-rail passes to free.
//
// Bitcoin passes are time-boxed (no native recurring): the entitlement webhook
// sets users.plan_expires_at = now + period. This janitor downgrades any user
// whose expiry has passed back to free. Stripe subscribers (plan_expires_at
// null) are untouched — they manage their own lifecycle. Idempotent: a second
// run finds nothing.
//
// Schedule: daily (systemd timer, scripts/install-hetzner-crons.sh).

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { downgradeExpiredPlans } from "@/db/queries/billing-grants";
import { logDebug } from "@/db/queries/debug-logs";

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const downgraded = await downgradeExpiredPlans();
  await logDebug({
    source: "crons/downgrade-expired-plans",
    level: "info",
    message: "expired-pass sweep",
    meta: { downgraded },
  }).catch(() => {});
  return NextResponse.json({ ok: true, downgraded });
}
