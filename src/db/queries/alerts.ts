import { db } from "@/db";
import { alerts } from "@/db/schema";
import type { Alert, NewAlert } from "@/db/schema/alerts";
import { eq, and, desc, notInArray } from "drizzle-orm";
import { ALERT_TYPE_IDS } from "@/config/alert-types";

/** Insert an alert only if the user has no active (undismissed) alert of the
 *  same type — so a periodic checker (e.g. runner-stall) raises the flag once
 *  and stops spamming until the operator dismisses it. Returns the new row, or
 *  null when an active one already existed. */
export async function insertActiveAlertOnce(alert: NewAlert): Promise<Alert | null> {
  const [existing] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.userId, alert.userId), eq(alerts.type, alert.type), eq(alerts.dismissed, false)))
    .limit(1);
  if (existing) return null;
  const [row] = await db.insert(alerts).values(alert).returning();
  return row;
}

/**
 * Raise-or-refresh: keep exactly one active alert of `type` per user, and keep
 * its wording current. `created` is true only when the flag went up — callers
 * use it to fire the out-of-band ping (Telegram) exactly once per episode
 * instead of on every tick. Refreshing an existing alert deliberately does NOT
 * count as creation: the count changing from 2 to 3 is not a new event.
 */
export async function refreshOrInsertActiveAlert(
  alert: NewAlert,
): Promise<{ alert: Alert | null; created: boolean }> {
  const [existing] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.userId, alert.userId), eq(alerts.type, alert.type), eq(alerts.dismissed, false)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(alerts)
      .set({
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        metadata: alert.metadata,
        actionUrl: alert.actionUrl,
      })
      .where(eq(alerts.id, existing.id))
      .returning();
    return { alert: updated ?? null, created: false };
  }

  const [row] = await db.insert(alerts).values(alert).returning();
  return { alert: row ?? null, created: true };
}

/**
 * Clear alerts whose TYPE no code can raise any more.
 *
 * When a feature is retired, its alert rows are not. Measured 2026-08-26: four
 * of ten open alerts — `bill_due`, `stale_relationship`, `overdue_commitment`,
 * `stalled_goal` — were raised between May and June by producers that no longer
 * exist. Nothing could refresh them and nothing could auto-resolve them, so
 * they sat for up to 108 days at the top of the surface that also carries "a
 * telemetry sensor is dead" and "a machine is running old code".
 *
 * Safe by construction, and that is the whole argument for doing it
 * automatically: a type absent from ALERT_TYPES has no producer, so no live
 * condition can be hidden by clearing it. The only thing being thrown away is
 * a claim nothing is willing to make any more.
 *
 * Deletion as a consequence of the producer being gone, rather than an act of
 * will by whoever remembers. Returns the types cleared, so the caller can say
 * what happened instead of tidying up in silence.
 */
export async function dismissUnregisteredAlerts(): Promise<{ type: string; count: number }[]> {
  const cleared = await db
    .update(alerts)
    .set({ dismissed: true, dismissedAt: new Date() })
    .where(and(eq(alerts.dismissed, false), notInArray(alerts.type, ALERT_TYPE_IDS)))
    .returning({ type: alerts.type });

  const byType = new Map<string, number>();
  for (const row of cleared) byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  return [...byType].map(([type, count]) => ({ type, count }));
}

/** Open alerts grouped by type — what the surface currently claims, for a
 *  sweeper that wants to report the state it left behind. */
export async function countOpenAlertsByType(): Promise<{ type: string; count: number }[]> {
  const rows = await db
    .select({ type: alerts.type })
    .from(alerts)
    .where(eq(alerts.dismissed, false));
  const byType = new Map<string, number>();
  for (const row of rows) byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  return [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

/**
 * Auto-resolve: clear this user's active alerts of `type` because the condition
 * that raised them is gone. Without this an alert stays up until dismissed by
 * hand, and — because raise-once dedupes against it — the NEXT occurrence is
 * silently swallowed. A flag that cannot fall is a flag that only works once.
 * Returns how many were cleared.
 */
export async function dismissActiveAlertsByType(userId: string, type: string): Promise<number> {
  const cleared = await db
    .update(alerts)
    .set({ dismissed: true, dismissedAt: new Date() })
    .where(and(eq(alerts.userId, userId), eq(alerts.type, type), eq(alerts.dismissed, false)))
    .returning({ id: alerts.id });
  return cleared.length;
}

/** Users currently flagged with an active alert of `type` — the set a sweeper
 *  must consider for auto-resolution, including users its main query no longer
 *  returns (that absence is exactly what "resolved" looks like). */
export async function getUserIdsWithActiveAlertType(type: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: alerts.userId })
    .from(alerts)
    .where(and(eq(alerts.type, type), eq(alerts.dismissed, false)));
  return rows.map((r) => r.userId);
}

export async function getActiveAlerts(userId: string) {
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.dismissed, false)))
    .orderBy(desc(alerts.createdAt))
    .limit(20);
}

export async function dismissAlert(id: string, userId: string) {
  return db
    .update(alerts)
    .set({ dismissed: true, dismissedAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)))
    .returning();
}
