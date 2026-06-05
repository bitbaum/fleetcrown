// Beacon popup SSE — Change 4 (DB-backed).
//
// Pre-Change-4: scanned /tmp/<APP_SLUG>-beacon every 150ms for new JSON
// files and pushed them as SSE frames. Now: queries the DB on the same
// cadence and pushes only this user's pending sessions. Same protocol on
// the wire, just durable + user-scoped storage underneath.
//
// Polling is preserved (vs LISTEN/NOTIFY push) to keep the diff small.
// A v2 step adds a NOTIFY trigger on beacon_sessions; the bridge already
// has the LISTEN plumbing, so the SSE here would degrade to a single
// initial fetch + bus-driven pushes.

import { execSync } from "child_process";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { parseProjectsConf } from "@/lib/agent-config";
import { getLatestPendingSession, type BeaconSession } from "@/db/queries/beacon-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 150;
const KEEPALIVE_MS = 20_000;

export async function GET(): Promise<Response> {
  const userId = await getSessionUserId();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  // Track the last session id we've pushed so we don't replay it every
  // poll while the user is sitting on the popup.
  let lastPushedId: string | null = null;

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

      function enrichAndPush(session: BeaconSession) {
        // Enrich with git branch on local-runtime nodes so the popup
        // shows what branch the agent was operating on. Identical
        // logic to the pre-Change-4 file-based version.
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
        lastPushedId = session.id;
      }

      async function pollOnce() {
        if (closed) return;
        try {
          const session = await getLatestPendingSession(userId!);
          if (session && session.id !== lastPushedId) {
            enrichAndPush(session);
          }
        } catch {
          // DB error during this tick — keep the stream alive; next tick may succeed.
        }
      }

      // Initial deliver: surface any pending row at connect time. void to
      // avoid blocking the readable-stream start() handler.
      void pollOnce();

      pollTimer = setInterval(() => { void pollOnce(); }, POLL_MS);
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
