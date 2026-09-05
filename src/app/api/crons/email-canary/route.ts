import { isMailConfigured, mailHealth } from "@bitbaum/mail-kit";
import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { ensureOwnerWeeklyDigest } from "@/lib/email-owner-digest";

/**
 * Email-path health check. Does not send a "canary" message to a human inbox —
 * that mail has no product value. Proves RESEND_API_KEY is accepted via
 * mail-kit's key-validity + domain-status probe, and turns on weekly digest
 * for the default operator if they have never opted in (so the useful mail is
 * the one that actually goes out).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  if (!isMailConfigured()) {
    logDebug({
      source: "crons/email-canary",
      level: "warn",
      message: "mail unconfigured (no or placeholder RESEND_API_KEY) — email path dark",
      meta: {},
    });
    return NextResponse.json({ ok: false, skipped: "mail not configured" });
  }

  // mailHealth never throws — network errors come back as { ok: false, error }.
  const health = await mailHealth({ timeoutMs: 10_000 });
  const resendOk = health.ok;
  if (!health.ok) {
    logDebug({
      source: "crons/email-canary",
      level: "error",
      message: `Resend probe failed: ${health.error ?? "unknown"}`,
      meta: {},
    });
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
