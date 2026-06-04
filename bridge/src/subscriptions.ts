// Per-user SSE subscription registry. Keyed by user_id so a NOTIFY for
// user A goes only to user A's open connections (browser tab, desktop
// app, phone — any device that authenticated with one of A's ck_* tokens).
//
// Why an in-memory Map and not Redis: at our scale (thousands of users
// max for v0.6) one bridge process holds every active connection. If we
// outgrow this — say tens of thousands of concurrent connections — we
// add a Redis pubsub layer between the bridge instances. Premature today.

import type { Subscription, ChangeEvent } from "./types.js";

const subscribers = new Map<string, Set<Subscription>>();

/** Track a freshly-authenticated SSE connection. */
export function add(sub: Subscription): void {
  let set = subscribers.get(sub.userId);
  if (!set) {
    set = new Set();
    subscribers.set(sub.userId, set);
  }
  set.add(sub);
}

/** Remove on disconnect. Idempotent — safe to call from both the request
 *  'close' handler and an explicit cleanup path. */
export function remove(sub: Subscription): void {
  const set = subscribers.get(sub.userId);
  if (!set) return;
  set.delete(sub);
  if (set.size === 0) subscribers.delete(sub.userId);
  clearInterval(sub.heartbeat);
}

/** Write a change event to every connection owned by event.u. */
export function fanout(event: ChangeEvent, eventId: number): void {
  const set = subscribers.get(event.u);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(event);
  const frame = `id: ${eventId}\nevent: change\ndata: ${payload}\n\n`;
  // Iterate via Array.from in case a write triggers an immediate
  // disconnect that mutates the set mid-loop.
  for (const sub of Array.from(set)) {
    try {
      sub.res.write(frame);
      sub.lastSentId = eventId;
    } catch {
      // Connection died between NOTIFY receipt and write. Drop it; the
      // 'close' handler that fires on the request will remove() it too.
      remove(sub);
    }
  }
}

/** Diagnostic / metrics endpoint helper. */
export function stats(): { users: number; connections: number } {
  let connections = 0;
  for (const set of subscribers.values()) connections += set.size;
  return { users: subscribers.size, connections };
}
