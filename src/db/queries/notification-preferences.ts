import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences, type DigestCadence } from "@/db/schema/notification-preferences";
import { users } from "@/db/schema/users";
import { DAY_MS, HOUR_MS } from "@/lib/constants/time";

export async function getNotificationPreferences(userId: string) {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertNotificationPreferences(
  userId: string,
  patch: { emailDigestCadence: DigestCadence },
) {
  const existing = await getNotificationPreferences(userId);
  const now = new Date();
  if (existing) {
    await db
      .update(notificationPreferences)
      .set({
        emailDigestCadence: patch.emailDigestCadence,
        updatedAt: now,
      })
      .where(eq(notificationPreferences.userId, userId));
    return;
  }
  await db.insert(notificationPreferences).values({
    userId,
    emailDigestCadence: patch.emailDigestCadence,
    createdAt: now,
    updatedAt: now,
  });
}

// Cadence-to-minimum-interval mapping for the "is this user due for a send?"
// check. Slight under-shoot on the longer cadences (6.5d / 29d) so a clock-
// drifted cron run still picks up users at the rate they asked for.
const MIN_INTERVAL_MS: Record<Exclude<DigestCadence, "none">, number> = {
  daily: 23 * HOUR_MS,
  weekly: 6.5 * DAY_MS,
  monthly: 29 * DAY_MS,
};

export type DueDigestRow = {
  userId: string;
  email: string;
  cadence: Exclude<DigestCadence, "none">;
};

// Find users due for a digest email — opted in (cadence != "none") AND
// (never sent OR sent longer than the cadence interval ago). Joined with
// users so the cron has the email address ready.
export async function getUsersDueForDigest(now: Date): Promise<DueDigestRow[]> {
  const cutoffs = {
    daily: new Date(now.getTime() - MIN_INTERVAL_MS.daily),
    weekly: new Date(now.getTime() - MIN_INTERVAL_MS.weekly),
    monthly: new Date(now.getTime() - MIN_INTERVAL_MS.monthly),
  };

  const rows = await db
    .select({
      userId: notificationPreferences.userId,
      email: users.email,
      cadence: notificationPreferences.emailDigestCadence,
      lastSent: notificationPreferences.lastDigestSentAt,
    })
    .from(notificationPreferences)
    .innerJoin(users, eq(users.id, notificationPreferences.userId))
    .where(
      or(
        and(
          eq(notificationPreferences.emailDigestCadence, "daily"),
          or(
            isNull(notificationPreferences.lastDigestSentAt),
            lt(notificationPreferences.lastDigestSentAt, cutoffs.daily),
          ),
        ),
        and(
          eq(notificationPreferences.emailDigestCadence, "weekly"),
          or(
            isNull(notificationPreferences.lastDigestSentAt),
            lt(notificationPreferences.lastDigestSentAt, cutoffs.weekly),
          ),
        ),
        and(
          eq(notificationPreferences.emailDigestCadence, "monthly"),
          or(
            isNull(notificationPreferences.lastDigestSentAt),
            lt(notificationPreferences.lastDigestSentAt, cutoffs.monthly),
          ),
        ),
      ),
    );

  return rows
    .filter(
      (r): r is typeof r & { email: string; cadence: Exclude<DigestCadence, "none"> } =>
        Boolean(r.email) && r.cadence !== "none",
    )
    .map((r) => ({ userId: r.userId, email: r.email, cadence: r.cadence }));
}

export async function markDigestSent(userId: string, sentAt: Date) {
  await db
    .update(notificationPreferences)
    .set({ lastDigestSentAt: sentAt, updatedAt: sentAt })
    .where(eq(notificationPreferences.userId, userId));
}
