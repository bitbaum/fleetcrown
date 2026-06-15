// Connection-based runner presence.
//
// The runner holds a persistent SSE connection here. That connection IS the
// "is the runner online" signal — no heartbeat timer. We bump a per-user
// connection count on connect and decrement on disconnect; `connected` is
// simply count > 0. A reference count (not a bool) tolerates reconnect overlap
// and two machines on the same account.
//
// We also pg_notify the state channel so the web /control stream re-renders the
// online badge in <1s instead of waiting for its fallback tick.
//
// Crash safety: resetAll() on bridge boot zeroes every row — a fresh bridge
// process holds zero connections, so any `connected=true` left by a previous
// crash is cleared before clients re-register.
//
// See docs/architecture/connection-presence.md.

import type { Pool } from "pg";

// The web /control stream's pgListener (src/app/api/control/stream/route.ts)
// listens on NOTIFY_CHANNEL = `${APP_SLUG}_state` (= "fleetcrown_state"),
// payload = user_id. That is the channel we must notify to wake the online
// badge — NOT the bridge's own rich "fc:state" channel (whose payload is a
// JSON blob the web stream doesn't parse). Overridable for non-prod slugs.
const STATE_NOTIFY_CHANNEL = (process.env.FC_STATE_NOTIFY_CHANNEL ?? "fleetcrown_state").trim();

async function notifyState(pool: Pool, userId: string): Promise<void> {
  // pg_notify payload = userId; the web stream's LISTEN handler re-ticks for
  // exactly this user. Best-effort — presence is still correct without it,
  // just up to one fallback-tick slower.
  await pool.query("SELECT pg_notify($1, $2)", [STATE_NOTIFY_CHANNEL, userId]).catch(() => {});
}

/** A runner SSE connection opened. Idempotent-safe under concurrency. */
export async function markConnect(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO runner_presence (user_id, connection_count, connected, connected_at, last_change_at)
       VALUES ($1, 1, true, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       connection_count = runner_presence.connection_count + 1,
       connected        = true,
       connected_at     = CASE WHEN runner_presence.connection_count = 0
                               THEN NOW() ELSE runner_presence.connected_at END,
       last_change_at   = NOW()`,
    [userId],
  );
  await notifyState(pool, userId);
}

/** A runner SSE connection closed. Floors at 0 so a double-close can't
 *  underflow the count and wrongly keep the runner "online". */
export async function markDisconnect(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE runner_presence SET
       connection_count = GREATEST(0, connection_count - 1),
       connected        = GREATEST(0, connection_count - 1) > 0,
       last_change_at   = NOW()
     WHERE user_id = $1`,
    [userId],
  );
  await notifyState(pool, userId);
}

/** Bridge boot: this process holds no connections yet, so clear every stale
 *  count left by a previous (possibly crashed) bridge before clients reconnect. */
export async function resetAll(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE runner_presence
        SET connection_count = 0, connected = false, last_change_at = NOW()
      WHERE connection_count <> 0 OR connected
      RETURNING user_id`,
  );
  // Wake any open /control streams so a freshly-restarted bridge doesn't leave
  // the badge stuck "online" until the first reconnect.
  for (const r of rows) await notifyState(pool, r.user_id);
}
