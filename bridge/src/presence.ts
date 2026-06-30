// Connection-based runner presence — cloud vs local channels (A4).
// See docs/architecture/connection-presence.md.

import type { Pool } from "pg";

const STATE_NOTIFY_CHANNEL = (process.env.FC_STATE_NOTIFY_CHANNEL ?? "fleetcrown_state").trim();

export type PresenceChannel = "cloud" | "local";

async function notifyState(pool: Pool, userId: string): Promise<void> {
  await pool.query("SELECT pg_notify($1, $2)", [STATE_NOTIFY_CHANNEL, userId]).catch(() => {});
}

/** A runner SSE connection opened on cloud (box-runner) or local (desktop). */
export async function markConnect(pool: Pool, userId: string, channel: PresenceChannel = "local"): Promise<void> {
  await pool.query(
    `INSERT INTO runner_presence (
       user_id, connection_count, connected, connected_at, last_change_at,
       cloud_connection_count, cloud_connected,
       local_connection_count, local_connected
     )
       VALUES ($1, 1, true, NOW(), NOW(),
         CASE WHEN $2 = 'cloud' THEN 1 ELSE 0 END,
         CASE WHEN $2 = 'cloud' THEN true ELSE false END,
         CASE WHEN $2 = 'local' THEN 1 ELSE 0 END,
         CASE WHEN $2 = 'local' THEN true ELSE false END)
     ON CONFLICT (user_id) DO UPDATE SET
       connection_count = runner_presence.connection_count + 1,
       connected        = true,
       connected_at     = CASE WHEN runner_presence.connection_count = 0
                               THEN NOW() ELSE runner_presence.connected_at END,
       cloud_connection_count = runner_presence.cloud_connection_count
         + CASE WHEN $2 = 'cloud' THEN 1 ELSE 0 END,
       cloud_connected = runner_presence.cloud_connected
         OR CASE WHEN $2 = 'cloud' THEN true ELSE false END,
       local_connection_count = runner_presence.local_connection_count
         + CASE WHEN $2 = 'local' THEN 1 ELSE 0 END,
       local_connected = runner_presence.local_connected
         OR CASE WHEN $2 = 'local' THEN true ELSE false END,
       last_change_at   = NOW()`,
    [userId, channel],
  );
  await notifyState(pool, userId);
}

/** A runner SSE connection closed. Floors counts at 0. */
export async function markDisconnect(pool: Pool, userId: string, channel: PresenceChannel = "local"): Promise<void> {
  await pool.query(
    `UPDATE runner_presence SET
       connection_count = GREATEST(0, connection_count - 1),
       cloud_connection_count = GREATEST(0, cloud_connection_count
         - CASE WHEN $2 = 'cloud' THEN 1 ELSE 0 END),
       local_connection_count = GREATEST(0, local_connection_count
         - CASE WHEN $2 = 'local' THEN 1 ELSE 0 END),
       cloud_connected = GREATEST(0, cloud_connection_count
         - CASE WHEN $2 = 'cloud' THEN 1 ELSE 0 END) > 0,
       local_connected = GREATEST(0, local_connection_count
         - CASE WHEN $2 = 'local' THEN 1 ELSE 0 END) > 0,
       connected = (
         GREATEST(0, cloud_connection_count - CASE WHEN $2 = 'cloud' THEN 1 ELSE 0 END) > 0
         OR GREATEST(0, local_connection_count - CASE WHEN $2 = 'local' THEN 1 ELSE 0 END) > 0
       ),
       last_change_at = NOW()
     WHERE user_id = $1`,
    [userId, channel],
  );
  await notifyState(pool, userId);
}

/** Bridge boot: this process holds no connections yet. */
export async function resetAll(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE runner_presence
        SET connection_count = 0,
            connected = false,
            cloud_connection_count = 0,
            cloud_connected = false,
            local_connection_count = 0,
            local_connected = false,
            last_change_at = NOW()
      WHERE connection_count <> 0
         OR connected
         OR cloud_connection_count <> 0
         OR local_connection_count <> 0
      RETURNING user_id`,
  );
  for (const r of rows) await notifyState(pool, r.user_id);
}
