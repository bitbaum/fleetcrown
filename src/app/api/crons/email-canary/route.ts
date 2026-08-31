import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { ensureOwnerWeeklyDigest } from "@/lib/email-owner-digest";

/**
 * Email-path health check. Does not send a "canary" message to a human inbox —
 * that mail has no product value. Proves RESEND_API_KEY is accepted by listing
 * domains, and turns on weekly digest for the default operator if they have
 * never opted in (so the useful mail is the one that actually goes out).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    logDebug({
      source: "crons/email-canary",
      level: "warn",
      message: "RESEND_API_KEY unset — email path dark",
      meta: {},
    });
    return NextResponse.json({ ok: false, skipped: "no RESEND_API_KEY" });
  }

  let resendOk = false;
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    resendOk = res.ok;
    if (!res.ok) {
      logDebug({
        source: "crons/email-canary",
        level: "error",
        message: `Resend probe failed: HTTP ${res.status}`,
        meta: { status: res.status },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logDebug({
      source: "crons/email-canary",
      level: "error",
      message: `Resend probe failed: ${message}`,
      meta: {},
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const digestEnabled = await ensureOwnerWeeklyDigest();

  logDebug({
    source: "crons/email-canary",
    level: resendOk ? "info" : "error",
    message: resendOk ? "Resend probe ok" : "Resend probe failed",
    meta: { resendOk, digestEnabled },
  });
  return NextResponse.json({ ok: resendOk, digestEnabled });
}
