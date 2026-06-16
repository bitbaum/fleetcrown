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
import { getUsersDueForDigest, markDigestSent } from "@/db/queries/notification-preferences";
import { generateDigest } from "@/lib/digest-generator";
import { appUrl, digestEmailTemplate, sendEmail } from "@/lib/email";

// Map cadence → digest window + human-readable labels.
const CADENCE_MAP = {
  daily:   { window: "day",   windowLabel: "the last 24 hours" },
  weekly:  { window: "week",  windowLabel: "the last 7 days"   },
  monthly: { window: "month", windowLabel: "the last 30 days"  },
} as const;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const startedAt = new Date();
  const due = await getUsersDueForDigest(startedAt);

  const results: Array<{ userId: string; status: "sent" | "skipped_empty" | "error"; error?: string }> = [];
  const activityUrl = `${appUrl()}/activity`;

  // Serial loop on purpose — Groq calls cost ~1–3s each and we'd rather not
  // hammer the API or risk a thundering-herd email surge. Cron tick has plenty
  // of headroom even at a few hundred opted-in users.
  for (const row of due) {
    try {
      const { window, windowLabel } = CADENCE_MAP[row.cadence];
      const generated = await generateDigest({
        userId: row.userId,
        window,
        project: null,
        windowLabel,
      });

      // Skip empty windows so opted-in users don't get a "nothing happened"
      // email every day they were inactive. Still update the lastDigestSentAt
      // so the cadence clock doesn't drift.
      const hasActivity = generated.digest.timeline.length > 0;
      if (!hasActivity) {
        await markDigestSent(row.userId, startedAt);
        results.push({ userId: row.userId, status: "skipped_empty" });
        continue;
      }

      const { subject, html, text } = digestEmailTemplate({
        markdown: generated.markdown,
        cadenceLabel: row.cadence,
        windowLabel,
        activityUrl,
      });
      await sendEmail(row.email, subject, html, text);
      await markDigestSent(row.userId, startedAt);
      results.push({ userId: row.userId, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      results.push({ userId: row.userId, status: "error", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    consideredAt: startedAt.toISOString(),
    due: due.length,
    sent:    results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped_empty").length,
    errors:  results.filter((r) => r.status === "error").length,
    details: results,
  });
}
