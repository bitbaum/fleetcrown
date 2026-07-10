import { db } from "@/db";
import { alerts } from "@/db/schema";
import type { Alert, NewAlert } from "@/db/schema/alerts";
import { eq, and, desc } from "drizzle-orm";

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
