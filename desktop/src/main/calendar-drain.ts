/**
 * Fleet Runner calendar-event drain.
 *
 * Calendar writes run through the locally-authenticated `gog` CLI, which only
 * exists on the operator's machine. Approvals, though, usually happen on the
 * cloud control plane (phone/browser) where gog isn't present — so executeAction
 * leaves those approved events at status='approved', unbooked (see
 * src/lib/actions/execute-action.ts). This runner is the local half that books
 * them for real.
 *
 * Every DRAIN_INTERVAL_MS it runs one pass (drainOnce): GET the approved-but-
 * unbooked events, book each via `gog calendar create`, POST the outcome back so
 * the cloud advances the row to 'executed'. The `actions` table stays the single
 * source of truth — nothing is copied into a second queue, so re-polling is
 * idempotent (a booked row drops out of the next GET pass).
 *
 * Auth + base URL are shared with the poller/pusher: same saved bearer token
 * (token-store) and same FLEETCROWN_WEB_URL||APP_URL resolution. We deliberately
 * do NOT clear the token on auth failure here — the poller/pusher own that
 * lifecycle; the drain just backs off and lets their restart hooks recover.
 */

import { APP_URL } from "@/config/brand";
import { drainOnce } from "@home/calendar-drain";
import { loadToken } from "./token-store";

// Slower cadence than the command poller: calendar events aren't latency-
// sensitive, and each pass shells out to gog. 30s keeps "approve on phone →
// booked" feeling near-instant without hammering gog's token bucket.
const DRAIN_INTERVAL_MS = 30_000;

const BASE_URL = (process.env.FLEETCROWN_WEB_URL || "").trim() || APP_URL;

let timer: NodeJS.Timeout | null = null;
let stopped = false;
let inFlight = false;

async function drainPass(): Promise<void> {
  // Coalesce: a slow gog booking must never let two passes overlap and double-
  // book. If the previous pass is still running, skip this tick.
  if (inFlight) return;
  const token = loadToken();
  if (!token) return;
  inFlight = true;
  try {
    const { booked, failed } = await drainOnce({ baseUrl: BASE_URL, token });
    if (booked || failed) {
      console.log(`[calendar-drain] pass: booked ${booked}, failed ${failed}`);
    }
  } catch (err) {
    // Network blip, 401, gog missing — non-fatal. Retry next tick. The poller/
    // pusher surface + recover token problems; we stay quiet-but-alive.
    console.warn("[calendar-drain] pass errored:", (err as Error).message);
  } finally {
    inFlight = false;
  }
}

/**
 * Start the calendar drain. Idempotent — calling while already running is a
 * no-op. Fires once immediately so a just-approved event books within seconds
 * of launch, then every DRAIN_INTERVAL_MS.
 */
export function startCalendarDrain(): void {
  if (timer) return;
  stopped = false;
  void drainPass();
  timer = setInterval(() => {
    if (!stopped) void drainPass();
  }, DRAIN_INTERVAL_MS);
}

export function stopCalendarDrain(): void {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Called on token change (paste / deep-link auth) and on system wake. */
export function restartCalendarDrain(): void {
  stopCalendarDrain();
  startCalendarDrain();
}
