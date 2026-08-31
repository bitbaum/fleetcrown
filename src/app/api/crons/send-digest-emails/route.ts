// Cron target — sends opt-in activity digests via email.
//
// Runs daily. Each tick walks every notification_preferences row with
// cadence != "none", checks whether the user is due (24h / 7d / 30d cutoffs),
// generates a Groq-summarized digest, and sends the email through Resend.
// Idempotent per user via lastDigestSentAt.
//
// Auth: requireCronAuth — the cron caller sends Authorization: Bearer ${CRON_SECRET}
// automatically. Local dev with no CRON_SECRET is permitted (see cron-auth.ts).

import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { logDebug } from "@/db/queries/debug-logs";
import { getUsersDueForDigest, markDigestSent } from "@/db/queries/notification-preferences";
import { generateDigest } from "@/lib/digest-generator";
import { appUrl, digestEmailTemplate, sendEmail } from "@/lib/email";
import { summarizeActivity } from "@/lib/activity-summary";
import { ensureOwnerWeeklyDigest } from "@/lib/email-owner-digest";
import { DIGEST_CADENCE_COPY } from "@/config/comms";

const DIGEST_WINDOW = {
  daily: "day",
  weekly: "week",
  monthly: "month",
} as const;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const startedAt = new Date();
  await ensureOwnerWeeklyDigest();
  const due = await getUsersDueForDigest(startedAt);

  const results: Array<{
    userId: string;
    status: "sent" | "skipped_empty" | "error";
    error?: string;
  }> = [];
  const activityUrl = `${appUrl()}/activity`;

  // Serial loop on purpose — Groq calls cost ~1–3s each and we'd rather not
  // hammer the API or risk a thundering-herd email surge. Cron tick has plenty
  // of headroom even at a few hundred opted-in users.
  for (const row of due) {
    try {
      const window = DIGEST_WINDOW[row.cadence];
      const windowLabel = DIGEST_CADENCE_COPY[row.cadence].windowLabel;
      const generated = await generateDigest({
        userId: row.userId,
        window,
        project: null,
        windowLabel,
      });

      // Skip empty windows so opted-in users don't get a "nothing happened"
      // email every day they were inactive. Still update the lastDigestSentAt
      // so the cadence clock doesn't drift.
      const hasActivity = generated.digest.events.length > 0;
      if (!hasActivity) {
        await markDigestSent(row.userId, startedAt);
        results.push({ userId: row.userId, status: "skipped_empty" });
        continue;
      }

      // Same numbers the Activity page leads with, so the email and the page
      // cannot tell different stories about the same window.
      const summary = summarizeActivity(generated.digest.events);
      const { subject, html, text } = digestEmailTemplate({
        markdown: generated.markdown,
        cadenceLabel: row.cadence,
        windowLabel,
        activityUrl,
        stats: {
          attention: summary.attention,
          shipped: summary.shipped,
          running: summary.running,
          agentLabel: summary.agentLabel,
        },
      });
      await sendEmail(row.email, subject, html, text);
      await markDigestSent(row.userId, startedAt);
      results.push({ userId: row.userId, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      results.push({ userId: row.userId, status: "error", error: message });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped_empty").length;
  const errors = results.filter((r) => r.status === "error").length;

  // A failed send is caught per-user so one bad address cannot stop the batch —
  // which also means the whole batch can fail while the route still answers
  // `ok: true` and systemd records a success. Persist it, or an email outage is
  // visible only in a journal that holds a day.
  await logDebug({
    source: "crons/send-digest-emails",
    level: errors > 0 ? "error" : "info",
    message:
      errors > 0
        ? `digest email send FAILED for ${errors}/${due.length} due user(s)`
        : `${sent} digest email(s) sent, ${skipped} skipped as empty, ${due.length} due`,
    meta: {
      consideredAt: startedAt.toISOString(),
      due: due.length,
      sent,
      skipped,
      errors,
      details: results,
    },
  });

  return NextResponse.json({
    ok: true,
    consideredAt: startedAt.toISOString(),
    due: due.length,
    sent,
    skipped,
    errors,
    details: results,
  });
}
