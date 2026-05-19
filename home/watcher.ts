#!/usr/bin/env -S npx tsx
/**
 * Watcher — M3 Bridge.
 *
 * Watches ~/.claude/sessions/<TAB>.md for changes. When an agent writes
 * its end-of-session handoff (done/next/tests/todos/health), this process
 * emits a `worker.idle` event into the JSONL event log so the Brain learns
 * about the run without modifying the agent's stop-hook scripts.
 *
 * This is deliberately observer-only:
 *   - existing scripts/cockpit-daemon.sh + scripts/agent-hook-bridge.sh
 *     keep running unchanged
 *   - existing /tmp/agent-* sentinels keep being written
 *   - the new Brain just gets a parallel view via the JSONL log
 *
 * M4 starts phasing out the legacy paths once this proves stable.
 *
 * Run:    npx tsx home/watcher.ts
 * Verify: edit any ~/.claude/sessions/*.md (or wait for a real agent to
 *         finish) and tail ~/.<APP_SLUG>/events.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { APP_NAME, APP_SLUG } from "@/config/brand";
import { appendEvent } from "./emit";
import type { Handoff } from "@/lib/events";

// Override via APP_SESSIONS_DIR for testing — production tails Claude's real dir.
const SESSIONS_DIR =
  process.env.APP_SESSIONS_DIR ?? path.join(os.homedir(), ".claude", "sessions");
/** Drop changes smaller than this (handles editor save-during-typing). */
const DEBOUNCE_MS = 250;

// ── Parse the session.md handoff format ──────────────────────────────────────
// Format (per project CLAUDE.md):
//   done: <one sentence>
//   next: <one sentence>
//   tests: <N pass · N fail, or 'no suite'>
//   todos: <count> TODOs
//   health: <good | needs attention | critical>

const FIELDS = ["done", "next", "tests", "todos", "health"] as const;

function parseHandoff(content: string): Handoff {
  const result: Record<string, string> = {};
  for (const field of FIELDS) {
    const m = content.match(new RegExp(`^${field}:\\s*(.*?)\\s*$`, "m"));
    result[field] = m?.[1] ?? "";
  }
  return result as Handoff;
}

// ── Watcher state ────────────────────────────────────────────────────────────

/** Last-seen mtime per session file. Skips duplicate fs.watch fires. */
const lastMtime = new Map<string, number>();
const pendingFlush = new Map<string, NodeJS.Timeout>();

function tabFromFilename(filename: string): string | null {
  if (!filename.endsWith(".md")) return null;
  return filename.slice(0, -3);
}

function readAndEmit(filename: string) {
  const tab = tabFromFilename(filename);
  if (!tab) return;
  const filePath = path.join(SESSIONS_DIR, filename);
  let stat: fs.Stats;
  try { stat = fs.statSync(filePath); } catch { return; }
  if (!stat.isFile()) return;

  const mtime = stat.mtimeMs;
  if ((lastMtime.get(filename) ?? 0) === mtime) return;
  lastMtime.set(filename, mtime);

  let content: string;
  try { content = fs.readFileSync(filePath, "utf8"); } catch { return; }
  const handoff = parseHandoff(content);

  // A session.md file always contains all 5 fields once the agent writes a
  // proper handoff. Empty/half-written files (mid-edit) get skipped so we
  // don't emit a no-signal event.
  if (!handoff.done && !handoff.next && !handoff.health) return;

  appendEvent({
    kind: "worker.idle",
    project: tab,
    handoff,
  });
  console.log(`[watcher] worker.idle ${tab} · ${handoff.done.slice(0, 60)}…`);
}

function scheduleFlush(filename: string) {
  const existing = pendingFlush.get(filename);
  if (existing) clearTimeout(existing);
  pendingFlush.set(filename, setTimeout(() => {
    pendingFlush.delete(filename);
    readAndEmit(filename);
  }, DEBOUNCE_MS));
}

// ── Boot ─────────────────────────────────────────────────────────────────────

function start() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`[watcher] ${SESSIONS_DIR} does not exist — is Claude installed?`);
    process.exit(1);
  }

  // Seed lastMtime from existing files without emitting — only react to changes
  // from this process forward. (We don't want every boot to re-emit the last
  // handoff of every project.)
  for (const file of fs.readdirSync(SESSIONS_DIR)) {
    if (!file.endsWith(".md")) continue;
    try {
      const stat = fs.statSync(path.join(SESSIONS_DIR, file));
      lastMtime.set(file, stat.mtimeMs);
    } catch { /* file deleted between readdir and stat — skip */ }
  }

  console.log(`[watcher] ${APP_NAME} bridge watching ${SESSIONS_DIR}`);
  console.log(`[watcher] seeded ${lastMtime.size} session files; emitting on change`);
  console.log(`[watcher] events → ~/.${APP_SLUG}/events.jsonl`);

  const w = fs.watch(SESSIONS_DIR, (eventType, filename) => {
    if (!filename) return;
    if (eventType !== "change" && eventType !== "rename") return;
    scheduleFlush(filename);
  });
  w.on("error", (err) => console.error("[watcher] fs.watch error:", err));

  const shutdown = (sig: string) => {
    console.log(`[watcher] ${sig} — shutting down`);
    w.close();
    for (const t of pendingFlush.values()) clearTimeout(t);
    process.exit(0);
  };
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
