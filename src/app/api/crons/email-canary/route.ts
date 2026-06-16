import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email";
import { logDebug } from "@/db/queries/debug-logs";

/**
 * Daily email canary — fires ~06:00 UTC (see scripts/install-hetzner-crons.sh).
 *
 * Proves the transactional-email path still works (valid RESEND_API_KEY, an
 * accepted from-domain) so key-rot or domain breakage surfaces within 24h in
 * debug_logs instead of when a user can't reset their password. Sends to
 * EMAIL_CANARY_TO; the send outcome is also auto-logged by lib/email
 * (source=email). Auth via requireCronAuth (fails closed in prod).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const to = process.env.EMAIL_CANARY_TO?.trim();
  if (!to) {
    logDebug({ source: "api/crons/email-canary", level: "warn", message: "no EMAIL_CANARY_TO configured — canary skipped", meta: {} });
    return NextResponse.json({ ok: false, skipped: "no EMAIL_CANARY_TO" });
  }

  const stamp = new Date().toISOString();
  try {
    await sendEmail(
      to,
      "FleetCrown email canary",
      `<p>FleetCrown transactional email is working — ${stamp}.</p>`,
      `FleetCrown transactional email is working — ${stamp}.`,
    );
    logDebug({ source: "api/crons/email-canary", level: "info", message: "canary sent ok", meta: { to } });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logDebug({ source: "api/crons/email-canary", level: "error", message: `canary FAILED: ${message}`, meta: { to } });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
