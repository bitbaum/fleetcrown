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
