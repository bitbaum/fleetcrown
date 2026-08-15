import { type NextRequest, NextResponse } from "next/server";
import { logDebug } from "@/db/queries/debug-logs";
import { requireCronAuth } from "@/lib/cron-auth";
import { isDemoEnabled } from "@/config/demo";
import { resetDemoTenant, DemoDisabledError } from "@/lib/demo-seed";

/**
 * Nightly demo reset — wipes the shared demo tenant and reseeds it.
 *
 * Fires from a systemd timer on the box (see scripts/install-hetzner-crons.sh),
 * staggered away from the other apps' resets.
 *
 * ── The dangerous part, stated plainly ───────────────────────────────────────
 * This endpoint DELETES A USER AND EVERY ROW THEY OWN, on an instance whose
 * other rows are George's real fleet. Three independent conditions must hold,
 * and none of them is "the caller said so":
 *
 *   1. CRON_SECRET — same bearer gate as every other cron here.
 *   2. DEMO_ACCESS_ENABLED=1 — the instance must declare that it hosts a demo
 *      at all. An instance that never opted in cannot be reset even with a
 *      valid secret, which is what keeps a leaked or copy-pasted cron call from
 *      being destructive somewhere it was never meant to run.
 *   3. The target is resolved inside resetDemoTenant() by the demo EMAIL alone.
 *      This route cannot name a user, and there is no parameter through which
 *      it could — the failure mode worth engineering against is not a wrong
 *      secret, it is a right secret pointed at the wrong row.
 *
 * Condition 2 is checked here as well as in resetDemoTenant() on purpose: this
 * is the layer where a misconfigured timer arrives, and it should be refused
 * with a clear message rather than an exception from three frames down.
 *
 * GET, not POST, because /opt/fleetcrown/fc-cron.sh curls every job without
 * -X — a POST-only handler here would 405 on every fire and the demo would
 * quietly stop resetting. Matching the shape the runner actually sends beats
 * matching HTTP semantics that nothing in this system enforces; CRON_SECRET,
 * not the verb, is what makes this safe.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  if (!isDemoEnabled()) {
    return NextResponse.json(
      { error: "Demo access is not enabled on this instance — refusing to reset.", ok: false },
      { status: 409 },
    );
  }

  try {
    const { userId, removed, seeded } = await resetDemoTenant();
    const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0);

    logDebug({
      source: "api/crons/reset-demo",
      level: "info",
      message: `Demo tenant reset — removed ${removedTotal} rows, seeded ${Object.keys(seeded).length} kinds`,
      meta: { userId, removed, seeded },
    });

    return NextResponse.json({ ok: true, userId, removed, seeded });
  } catch (err) {
    if (err instanceof DemoDisabledError) {
      return NextResponse.json({ error: err.message, ok: false }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    logDebug({
      source: "api/crons/reset-demo",
      level: "error",
      message: `Demo reset failed: ${message}`,
    });
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
