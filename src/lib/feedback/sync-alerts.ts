import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { siteFeedback, entities } from "@/db/schema";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { refreshOrInsertActiveAlert, dismissActiveAlertsByType } from "@/db/queries/alerts";

/** Alert type for feedback needing attention — must match config/alert-types.ts. */
const ALERT_TYPE = "new_feedback";

/** Longest suggestion excerpt an alert carries. */
const EXCERPT_MAX_CHARS = 160;

/**
 * Sync alerts with feedback that needs the operator.
 *
 * Creates/refreshes one alert when open feedback exists, clears it when the
 * inbox is empty. The notification panel fetches and displays individual
 * feedback items directly; this alert just ensures the bell badges.
 *
 * Designed to run periodically via cron (every 15 minutes) or on-demand when
 * feedback status changes.
 */
export async function syncFeedbackAlerts(): Promise<{ synced: number; cleared: number }> {
  // Get all users with open feedback (new or dispatched)
  const usersWithFeedback = await db
    .selectDistinct({
      userId: siteFeedback.userId,
    })
    .from(siteFeedback)
    .where(inArray(siteFeedback.status, [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED]));

  let synced = 0;
  for (const { userId } of usersWithFeedback) {
    // Count open feedback
    const [countResult] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(siteFeedback)
      .where(
        and(
          eq(siteFeedback.userId, userId),
          inArray(siteFeedback.status, [FEEDBACK_STATUS.NEW, FEEDBACK_STATUS.DISPATCHED]),
        ),
      );

    const count = countResult?.count ?? 0;
    if (count === 0) continue;

    const title =
      count === 1 ? "1 feedback item needs triage" : `${count} feedback items need triage`;

    await refreshOrInsertActiveAlert({
      userId,
      type: ALERT_TYPE,
      severity: "info",
      title,
      description: "Click to review feedback awaiting triage",
      actionUrl: "/feedback",
    });

    synced++;
  }

  // Clear alerts for users with no open feedback
  const allUsers = await db.selectDistinct({ userId: siteFeedback.userId }).from(siteFeedback);

  let cleared = 0;
  for (const { userId } of allUsers) {
    if (!usersWithFeedback.find((u) => u.userId === userId)) {
      const count = await dismissActiveAlertsByType(userId, ALERT_TYPE);
      cleared += count;
    }
  }

  return { synced, cleared };
}
