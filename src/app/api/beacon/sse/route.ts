import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { BeaconSession } from "@/app/api/beacon/route";
import { isRuntimeAvailable } from "@/lib/runtime";
import { parseProjectsConf } from "@/lib/agent-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BEACON_DIR = "/tmp/cockpit-beacon";
const POLL_MS = 150;
const KEEPALIVE_MS = 20_000;

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send(": keepalive\n\n");

      // Seed seen-set with already-resolved sessions so we never replay them on
      // reconnect. Active (choice=null) sessions are NOT seeded — they get pushed
      // immediately below and again on any reconnect until the user responds.
      const seen = new Set<string>();
      try {
        for (const file of fs.readdirSync(BEACON_DIR).filter((f) => f.endsWith(".json"))) {
          try {
            const raw = fs.readFileSync(path.join(BEACON_DIR, file), "utf-8");
            const s = JSON.parse(raw) as BeaconSession;
            if (s.choice !== null) seen.add(file);
          } catch { /* skip unreadable */ }
        }
      } catch { /* dir missing */ }

      function pushSession(file: string, raw: string) {
        try {
          const session = JSON.parse(raw) as BeaconSession;
          if (session.choice !== null) { seen.add(file); return; }
          if (isRuntimeAvailable() && !session.gitBranch) {
            try {
              const projects = parseProjectsConf();
              const match = projects.find((p) => p.tab.toLowerCase() === session.project.toLowerCase());
              if (match) {
                session.gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
                  cwd: match.dir, encoding: "utf-8", timeout: 2000,
                }).trim() || null;
              }
            } catch { /* not a git repo or dir missing */ }
          }
          send(`data: ${JSON.stringify(session)}\n\n`);
        } catch { /* malformed JSON */ }
      }

      // Deliver the most recently created pending session at connect time so a
      // pre-warmed /beacon/live window picks up sessions written before it opened.
      // Only sessions younger than 5 min are considered pending — older files
      // in /tmp are abandoned (agent that wrote them is gone) and replaying
      // them ghost-populates the popup with stale content. All other
      // pre-existing files are seeded into `seen` so they're not replayed.
      try {
        const PENDING_TTL_MS = 5 * 60_000;
        const minCreatedAt = Date.now() - PENDING_TTL_MS;
        type Entry = { file: string; raw: string; createdAt: number };
        let newest: Entry | null = null;
        for (const file of fs.readdirSync(BEACON_DIR).filter((f) => f.endsWith(".json"))) {
          if (seen.has(file)) continue;
          try {
            const raw = fs.readFileSync(path.join(BEACON_DIR, file), "utf-8");
            const s = JSON.parse(raw) as BeaconSession;
            if (s.choice === null && s.createdAt >= minCreatedAt) {
              if (!newest || s.createdAt > newest.createdAt) newest = { file, raw, createdAt: s.createdAt };
            }
          } catch { /* skip */ }
          seen.add(file);
        }
        if (newest) pushSession(newest.file, newest.raw);
      } catch { /* dir missing */ }

      pollTimer = setInterval(() => {
        if (closed) return;
        try {
          const current = new Set(
            fs.readdirSync(BEACON_DIR).filter((f) => f.endsWith(".json")),
          );
          for (const file of current) {
            if (!seen.has(file)) {
              try {
                pushSession(file, fs.readFileSync(path.join(BEACON_DIR, file), "utf-8"));
              } catch { /* file deleted between readdir and readFile */ }
              seen.add(file);
            }
          }
        } catch { /* BEACON_DIR deleted — nothing to push */ }
      }, POLL_MS);

      keepaliveTimer = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
    },

    cancel() {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
