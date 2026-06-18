/**
 * Publish a non-durable fast-lane event (raw keystroke / resize) to the event
 * bridge so it reaches the user's Fleet Runner in near-real-time.
 *
 * Transport: a single Postgres `NOTIFY` on the bridge's `fc:state` channel. The
 * bridge (bridge/src/listen.ts) is already LISTENing there; it discriminates by
 * the `kind` field and fans the event out via a distinct SSE event name with no
 * id, so it bypasses the durable pending_commands path AND the replay buffer.
 *
 * Why not pending_commands: a DB row per keystroke is catastrophic, and a
 * replayed keystroke on reconnect is wrong. Fire-and-forget is correct here —
 * a dropped key is re-typed, unlike a lost command.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { BRIDGE_NOTIFY_CHANNEL, type FastLaneEvent } from "@/lib/event-stream-types";

export async function publishFastLaneEvent(event: FastLaneEvent): Promise<void> {
  // pg_notify(channel, payload) — both bound params. Payload is small (a few
  // keystroke bytes), well under Postgres's 8KB NOTIFY limit.
  await db.execute(sql`select pg_notify(${BRIDGE_NOTIFY_CHANNEL}, ${JSON.stringify(event)})`);
}
