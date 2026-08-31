import { pgTable, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Connection-based runner presence — SSOT for "is the Fleet Runner online".
 *
 * Written by the bridge (bridge/src/server.ts) on every runner SSE
 * connect/disconnect, NOT by a heartbeat timer. `connected` is authoritative
 * as long as the bridge process is up; the bridge resets all rows to 0 on boot
 * so a crash can't leave a stale `connected=true`.
 *
 * connection_count tolerates multiple concurrent runner connections (reconnect
 * overlap, two machines): connected === connection_count > 0.
 *
 * See docs/architecture/connection-presence.md.
 */
export const runnerPresence = pgTable("runner_presence", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  connectionCount: integer("connection_count").notNull().default(0),
  connected: boolean("connected").notNull().default(false),
  cloudConnectionCount: integer("cloud_connection_count").notNull().default(0),
  cloudConnected: boolean("cloud_connected").notNull().default(false),
  localConnectionCount: integer("local_connection_count").notNull().default(0),
  localConnected: boolean("local_connected").notNull().default(false),
  connectedAt: timestamp("connected_at", { withTimezone: true }), // when count last went 0→1
  lastChangeAt: timestamp("last_change_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RunnerPresence = typeof runnerPresence.$inferSelect;
export type NewRunnerPresence = typeof runnerPresence.$inferInsert;
