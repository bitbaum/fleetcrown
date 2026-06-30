/**
 * GET /api/control/peek-stream?tab=<tab>
 *
 * Live terminal view (bidirectional when interactive). A viewer opens this SSE;
 * the first viewer for a (user, tab) makes the runner start a PTY byte stream
 * (peek_start); keystrokes return via tab-inject-raw → bridge rawkey fast lane.
 */
import { NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { sseBus, peekChannel, addPeekViewer, removePeekViewer, type PeekFrame } from "@/lib/sse-bus";
import { enqueuePeekCommand } from "@/db/queries/pending-commands";
import type { RunnerChannel } from "@/db/schema/pending-commands";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const tab = new URL(req.url).searchParams.get("tab")?.trim();
  if (!tab) return new Response(JSON.stringify({ error: "tab required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const channelParam = new URL(req.url).searchParams.get("channel");
  const runnerChannel: RunnerChannel | undefined =
    channelParam === "cloud" || channelParam === "local" ? channelParam : undefined;

  const channel = peekChannel(userId, tab, runnerChannel);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (text: string) => { try { controller.enqueue(enc.encode(text)); } catch { /* client gone */ } };

      // First viewer for this tab → ask the runner to start streaming it.
      if (addPeekViewer(userId, tab, runnerChannel)) {
        await enqueuePeekCommand(userId, "peek_start", { tab, ...(runnerChannel ? { channel: runnerChannel } : {}) }).catch(() => {});
      }
      send(sseEvent("ready", { tab }));

      const onFrame = (payload: PeekFrame) => send(sseEvent("frame", payload));
      sseBus.on(channel, onFrame);

      const keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);

      // Cleanup on disconnect — last viewer stops the runner's loop.
      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        sseBus.off(channel, onFrame);
        if (removePeekViewer(userId, tab, runnerChannel)) {
          void enqueuePeekCommand(userId, "peek_stop", { tab, ...(runnerChannel ? { channel: runnerChannel } : {}) }).catch(() => {});
        }
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
