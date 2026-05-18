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

      // Seed the seen-set so we only push sessions that arrive AFTER this
      // connection opened — prevents replaying stale sessions on reconnect.
      let seen = new Set<string>();
      try {
        seen = new Set(
          fs.readdirSync(BEACON_DIR).filter((f) => f.endsWith(".json")),
        );
      } catch { /* dir missing — start empty */ }

      send(": keepalive\n\n");

      pollTimer = setInterval(() => {
        if (closed) return;
        try {
          const current = new Set(
            fs.readdirSync(BEACON_DIR).filter((f) => f.endsWith(".json")),
          );
          for (const file of current) {
            if (!seen.has(file)) {
              try {
                const raw = fs.readFileSync(
                  path.join(BEACON_DIR, file),
                  "utf-8",
                );
                const session = JSON.parse(raw) as BeaconSession;
                // Only push fresh sessions — ignore ones already resolved.
                // gitBranch is written into the JSON by beacon.py at session creation;
                // fall back to a server-side lookup only if the JSON predates that change.
                if (session.choice === null) {
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
                }
              } catch { /* file deleted between readdir and readFile */ }
            }
          }
          seen = current;
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
