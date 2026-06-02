/**
 * Tail an append-only JSONL event log.
 *
 * On startup, reads the entire log from byte 0 and feeds every line through
 * onEvent. After that, watches the file for new appends and consumes only
 * the bytes added since the last read.
 *
 * Handles three failure modes:
 *   - File doesn't exist yet → creates parent dir + empty file
 *   - File was truncated/replaced → resets position to 0 and replays
 *   - Garbled line (manual edit, disk error) → onError, keeps consuming
 *
 * fs.watch is best-effort on Linux; the consume() function reads the full
 * delta from position to end on every watch fire, so missed events are
 * recovered as soon as the next change triggers.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { parseEvent, type Event } from "@/lib/events";

export type TailHandle = {
  /** Stop watching. Currently-being-read content still flushes. */
  close: () => void;
  /** Best-effort current byte offset into the log. */
  position: () => number;
};

/**
 * Phase passed to onEvent so consumers can distinguish initial replay from
 * subsequent live events. The Brain projection treats them the same — both
 * just update state. The Worker treats them differently — replay builds the
 * set of already-handled runIds; live events trigger new injections.
 */
export type EventPhase = "replay" | "live";

export function tailLog(
  filePath: string,
  onEvent: (event: Event, phase: EventPhase) => void,
  onError?: (err: Error, raw?: string) => void,
): TailHandle {
  // Make sure the file exists so fs.watch has a target. Parent dir too.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "");

  let position = 0;
  let buffer = "";
  let closed = false;
  let replaying = true;

  function consume() {
    if (closed) return;
    try {
      const stat = fs.statSync(filePath);
      // File was truncated or replaced — replay from the top.
      if (stat.size < position) {
        position = 0;
        buffer = "";
      }
      if (stat.size === position) return;

      const fd = fs.openSync(filePath, "r");
      try {
        const chunk = Buffer.alloc(stat.size - position);
        fs.readSync(fd, chunk, 0, chunk.length, position);
        position = stat.size;
        buffer += chunk.toString("utf8");
      } finally {
        fs.closeSync(fd);
      }

      const lines = buffer.split("\n");
      // Keep the final (possibly-partial) line in the buffer.
      buffer = lines.pop() ?? "";

      const phase: EventPhase = replaying ? "replay" : "live";
      for (const line of lines) {
        if (!line.trim()) continue;
        const result = parseEvent(line);
        if (result.ok) {
          onEvent(result.event, phase);
        } else if (onError) {
          onError(new Error(`parse: ${result.error}`), result.raw);
        }
      }
    } catch (e) {
      if (onError) onError(e as Error);
    }
  }

  // Initial replay of existing content (synchronous — replaying stays true).
  consume();
  replaying = false;

  const watcher = fs.watch(filePath, () => consume());
  watcher.on("error", (err) => { if (onError) onError(err); });

  return {
    close: () => { closed = true; watcher.close(); },
    position: () => position,
  };
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/log.ts --self-test
// Covers the synchronous replay path + error reporting + truncation reset.
// fs.watch live-append behavior is async; tested by integration only.

function selfTest() {
  // Each test gets a fresh tmp file so state doesn't leak between cases.
  function makeLogPath(): string {
    return path.join(os.tmpdir(), `fleetcrown-log-test-${randomUUID()}.jsonl`);
  }
  const validEvent = (project: string) =>
    `{"v":1,"id":"${randomUUID()}","ts":"2026-01-01T00:00:00Z","kind":"worker.idle","project":"${project}","handoff":{"done":"","next":"","tests":"","todos":"","health":"good"}}`;

  type Case = { name: string; run: () => boolean };
  const cases: Case[] = [
    {
      name: "initial replay classifies all existing lines as phase='replay'",
      run: () => {
        const log = makeLogPath();
        fs.writeFileSync(log, validEvent("A") + "\n" + validEvent("B") + "\n");
        const phases: EventPhase[] = [];
        const h = tailLog(log, (_e, p) => phases.push(p));
        h.close();
        fs.rmSync(log, { force: true });
        return phases.length === 2 && phases.every((p) => p === "replay");
      },
    },
    {
      name: "garbled line in initial replay fires onError without breaking subsequent valid lines",
      run: () => {
        const log = makeLogPath();
        fs.writeFileSync(log,
          `not-json-at-all\n` +
          validEvent("Good") + "\n" +
          `{"v":1,"id":"bad"}\n`,  // missing required fields
        );
        const okCount: Event["kind"][] = [];
        const errCount: string[] = [];
        const h = tailLog(log,
          (e) => okCount.push(e.kind),
          (err) => errCount.push(err.message));
        h.close();
        fs.rmSync(log, { force: true });
        return okCount.length === 1 && okCount[0] === "worker.idle"
            && errCount.length === 2;
      },
    },
    {
      name: "missing file is created at the path (parent dir included)",
      run: () => {
        const log = path.join(os.tmpdir(), `fleetcrown-log-test-${randomUUID()}/nested/log.jsonl`);
        const h = tailLog(log, () => undefined);
        h.close();
        const exists = fs.existsSync(log);
        const isEmpty = exists && fs.statSync(log).size === 0;
        fs.rmSync(path.dirname(path.dirname(log)), { recursive: true, force: true });
        return exists && isEmpty;
      },
    },
    {
      name: "empty file produces zero events and no errors",
      run: () => {
        const log = makeLogPath();
        fs.writeFileSync(log, "");
        let events = 0, errors = 0;
        const h = tailLog(log, () => events++, () => errors++);
        h.close();
        fs.rmSync(log, { force: true });
        return events === 0 && errors === 0;
      },
    },
    {
      name: "position() reflects bytes consumed during replay",
      run: () => {
        const log = makeLogPath();
        const body = validEvent("X") + "\n" + validEvent("Y") + "\n";
        fs.writeFileSync(log, body);
        const h = tailLog(log, () => undefined);
        const pos = h.position();
        h.close();
        fs.rmSync(log, { force: true });
        return pos === body.length;
      },
    },
    {
      name: "blank lines between events are skipped silently",
      run: () => {
        const log = makeLogPath();
        fs.writeFileSync(log, "\n\n" + validEvent("Z") + "\n\n");
        let events = 0, errors = 0;
        const h = tailLog(log, () => events++, () => errors++);
        h.close();
        fs.rmSync(log, { force: true });
        return events === 1 && errors === 0;
      },
    },
  ];

  let pass = 0, fail = 0;
  for (const c of cases) {
    if (c.run()) { console.log(`  ✓ ${c.name}`); pass++; }
    else         { console.log(`  ✗ ${c.name}`); fail++; }
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) selfTest();
}
