import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Idempotent: re-subscribing with the same endpoint refreshes lastSeenAt. */
export async function upsertSubscription(
  userId: string,
  sub: WebPushSubscription,
  userAgent: string | null,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint:  sub.endpoint,
      p256dh:    sub.keys.p256dh,
      auth:      sub.keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, lastSeenAt: new Date() },
    });
}

export async function removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Remove subscriptions by endpoint, scoped to a single user — used by the
 *  client's "unsubscribe" path so one user can't drop another user's row. */
export async function removeSubscriptionForUser(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function listSubscriptionsForUser(userId: string): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
  return db
    .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/** Push services return 404/410 for endpoints that no longer accept pushes
 *  (uninstalled PWA, revoked permission). The notify endpoint hands the
 *  dead set here so we GC in one batch. */
export async function pruneDeadEndpoints(endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
}
