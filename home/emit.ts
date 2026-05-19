/**
 * Append an event to the JSONL log.
 *
 * The single write-side counterpart to log.ts (which reads). Used by:
 *   - home/watcher.ts when an agent stop-hook signals worker.idle
 *   - home/server.ts:/api/events for manual testing
 *   - future M6 dispatch path (brain → bridge.dispatch → log → worker)
 *
 * Writes are append-only. We never rewrite or truncate the log here — the
 * worst case a corrupted line can do is fail to parse on the read side,
 * which log.ts handles via its parseEvent error path.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { APP_SLUG } from "@/config/brand";
import { EVENT_VERSION, serializeEvent, type Event } from "@/lib/events";

export const LOG_PATH = path.join(os.homedir(), `.${APP_SLUG}`, "events.jsonl");

/**
 * Common envelope fields. Stamps id + ts + v at append time.
 *
 * Distributive Omit via a generic parameter — native `Omit<Event, K>` keeps
 * the union as one shape and drops kind-specific fields like `handoff`. The
 * generic indirection (T extends unknown) is the canonical TS trick to make
 * the omit apply per-variant so each kind keeps its own fields.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventPayload = DistributiveOmit<Event, "id" | "ts" | "v">;

export function appendEvent(payload: EventPayload, logPath: string = LOG_PATH): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const event = {
    v: EVENT_VERSION,
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...payload,
  } as Event;
  fs.appendFileSync(logPath, serializeEvent(event));
}
