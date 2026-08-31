import { NextRequest } from "next/server";
import { executor } from "@/lib/agent-execution";
import { ownsWorkspace } from "@/lib/agent-execution/ownership";
import { getApiUserId } from "@/lib/session";
import { decideWorkspaceAccess } from "@/lib/workspace-access";
import { SSE_KEEPALIVE_MS } from "@/lib/constants/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workspaces/[id]/stream — SSE of the workspace's event stream.
 *  Replays retained history first (the browser sends Last-Event-ID on reconnect
 *  → resume from that seq), then live output/status/exit events. This is the
 *  connection plane for the LocalPtyExecutor; the xterm in the UI consumes it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  const { id } = await params;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const access = await decideWorkspaceAccess(userId);
  if (!access.ok) return new Response(access.error, { status: access.status });
  if (!ownsWorkspace(userId, id)) return new Response("Unauthorized", { status: 401 });
  if (!executor.get(id)) {
    return new Response("No such workspace", { status: 404 });
  }

  // The browser resends the last seq it saw via Last-Event-ID on auto-reconnect.
  const sinceSeq = Number(req.headers.get("last-event-id") ?? "0") || 0;
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          /* client disconnected */
        }
      };
      unsubscribe = executor.subscribe(id, sinceSeq, (event) => {
        safeEnqueue(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      keepalive = setInterval(() => safeEnqueue(": ping\n\n"), SSE_KEEPALIVE_MS);
      req.signal.addEventListener("abort", () => {
        if (keepalive) clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (keepalive) clearInterval(keepalive);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering (nginx/Caddy) so events flush immediately —
      // same requirement as the control SSE + the bridge (no compression on SSE).
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
