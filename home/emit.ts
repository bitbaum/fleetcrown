/**
 * Append an event to the JSONL log.
 *
 * The single write-side counterpart to log.ts (which reads). Used by:
 *   - home/watcher.ts when an agent stop-hook signals worker.idle
 *   - home/worker.ts when it emits worker.started / worker.crashed
 *   - the cloud /api/inject dispatch path (bridge.dispatch → log → worker)
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
import { EVENT_VERSION, parseEvent, serializeEvent, type Event } from "@/lib/events";

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

export function appendEvent(payload: EventPayload, logPath: string = LOG_PATH): Event {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const event = {
    v: EVENT_VERSION,
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...payload,
  } as Event;
  fs.appendFileSync(logPath, serializeEvent(event));
  // Return the stamped event so callers can eagerly project it into their
  // own state without waiting for tailLog to consume the write. Closes a
  // race in server.ts's /api/dispatch where back-to-back concurrent
  // requests both read pre-dispatch state because fs.watch hadn't fired
  // yet.
  return event;
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/emit.ts --self-test
// Writes to a unique temp file (NOT the real log) so production state isn't
// touched. Round-trips through parseEvent to verify the wire format holds.

function selfTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${APP_SLUG}-emit-test-`));
  const tmpLog = path.join(tmpDir, "events.jsonl");

  type Case = { name: string; run: () => boolean };
  const cases: Case[] = [
    {
      name: "appendEvent stamps v, id, ts and round-trips via parseEvent",
      run: () => {
        appendEvent(
          {
            kind: "worker.idle",
            project: "TestProject",
            handoff: { status: "", done: "", next: "", tests: "", todos: "", health: "good" },
          },
          tmpLog,
        );
        const line = fs.readFileSync(tmpLog, "utf8").trim();
        const parsed = parseEvent(line);
        if (!parsed.ok) return false;
        return (
          parsed.event.v === EVENT_VERSION &&
          typeof parsed.event.id === "string" &&
          parsed.event.id.length === 36 && // UUID
          parsed.event.ts.endsWith("Z") && // ISO 8601
          parsed.event.kind === "worker.idle" &&
          parsed.event.project === "TestProject"
        );
      },
    },
    {
      name: "two consecutive appends produce distinct ids",
      run: () => {
        const log = path.join(tmpDir, "distinct.jsonl");
        appendEvent(
          {
            kind: "worker.idle",
            project: "A",
            handoff: { status: "", done: "", next: "", tests: "", todos: "", health: "" },
          },
          log,
        );
        appendEvent(
          {
            kind: "worker.idle",
            project: "A",
            handoff: { status: "", done: "", next: "", tests: "", todos: "", health: "" },
          },
          log,
        );
        const lines = fs.readFileSync(log, "utf8").trim().split("\n");
        if (lines.length !== 2) return false;
        const r1 = parseEvent(lines[0]);
        const r2 = parseEvent(lines[1]);
        return r1.ok && r2.ok && r1.event.id !== r2.event.id;
      },
    },
    {
      name: "appendEvent creates the parent directory if missing",
      run: () => {
        const nested = path.join(tmpDir, "deeply/nested/path/log.jsonl");
        appendEvent(
          {
            kind: "worker.idle",
            project: "Nest",
            handoff: { status: "", done: "", next: "", tests: "", todos: "", health: "" },
          },
          nested,
        );
        return fs.existsSync(nested) && fs.statSync(nested).size > 0;
      },
    },
    {
      name: "bridge.dispatch payload preserves kind-specific fields (DistributiveOmit sanity check)",
      run: () => {
        const log = path.join(tmpDir, "dispatch.jsonl");
        appendEvent(
          {
            kind: "bridge.dispatch",
            project: "X",
            intent: "next_best",
            prompt: "go",
            runId: "550e8400-e29b-41d4-a716-446655440000",
            autonomy: "manual",
            reason: "test",
            confidence: 0.8,
          },
          log,
        );
        const parsed = parseEvent(fs.readFileSync(log, "utf8").trim());
        if (!parsed.ok || parsed.event.kind !== "bridge.dispatch") return false;
        return (
          parsed.event.prompt === "go" &&
          parsed.event.autonomy === "manual" &&
          parsed.event.confidence === 0.8
        );
      },
    },
    {
      name: "worker.crashed payload preserves the error message",
      run: () => {
        const log = path.join(tmpDir, "crashed.jsonl");
        appendEvent(
          {
            kind: "worker.crashed",
            project: "X",
            runId: "550e8400-e29b-41d4-a716-446655440000",
            error: "inject failed: tab not found",
          },
          log,
        );
        const parsed = parseEvent(fs.readFileSync(log, "utf8").trim());
        return (
          parsed.ok &&
          parsed.event.kind === "worker.crashed" &&
          parsed.event.error === "inject failed: tab not found"
        );
      },
    },
  ];

  let pass = 0,
    fail = 0;
  for (const c of cases) {
    if (c.run()) {
      console.log(`  ✓ ${c.name}`);
      pass++;
    } else {
      console.log(`  ✗ ${c.name}`);
      fail++;
    }
  }
  // Clean up the temp tree even on assertion failure.
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) selfTest();
}
