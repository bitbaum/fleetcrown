import { db } from "@/db";
import { alerts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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
