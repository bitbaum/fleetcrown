/**
 * Send a Web Push to every device a user has subscribed.
 *
 * Extracted from /api/push/notify so server-side callers can reach the operator
 * WITHOUT a self-HTTP round-trip (the route needs a Bearer the server does not
 * have, and an app calling its own API to talk to its own database is a loop
 * with two extra failure modes). Same reasoning that pulled inject-core out of
 * /api/inject.
 *
 * Fire-and-forget by contract: this must never throw and never slow the caller.
 * Every outcome is REPORTED rather than swallowed — `reason` distinguishes "push
 * is not configured on this deployment" from "the operator has no device
 * subscribed", because those need opposite fixes and a silent zero looks
 * identical for both.
 */
import { listSubscriptionsForUser, pruneDeadEndpoints } from "@/db/queries/push-subscriptions";
import { configureWebPush, sendOne, isDeadStatus, type PushPayload } from "@/lib/push";

export type PushFanoutResult = {
  sent: number;
  gc: number;
  errors: number;
  /** Set when nothing was sent, naming WHICH precondition was missing. */
  reason?: "not-configured" | "no-subscriptions" | "failed";
};

export async function pushToUser(userId: string, payload: PushPayload): Promise<PushFanoutResult> {
  try {
    const cfg = configureWebPush();
    if (!cfg.ok) return { sent: 0, gc: 0, errors: 0, reason: "not-configured" };

    const subs = await listSubscriptionsForUser(userId);
    if (subs.length === 0) return { sent: 0, gc: 0, errors: 0, reason: "no-subscriptions" };

    const results = await Promise.all(subs.map((s) => sendOne(s, payload)));

    // A 404/410 endpoint is a device that uninstalled or revoked. Reaping them
    // keeps the next fan-out from spending a request per dead phone forever.
    const dead = results.filter((r) => !r.ok && isDeadStatus(r.statusCode)).map((r) => r.endpoint);
    if (dead.length > 0) await pruneDeadEndpoints(dead).catch(() => undefined);

    const sent = results.filter((r) => r.ok).length;
    const errors = results.filter((r) => !r.ok && !isDeadStatus(r.statusCode)).length;
    return { sent, gc: dead.length, errors, ...(sent === 0 ? { reason: "failed" as const } : {}) };
  } catch {
    return { sent: 0, gc: 0, errors: 0, reason: "failed" };
  }
}
