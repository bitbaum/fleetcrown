// FleetCrown event bridge — Postgres LISTEN → SSE fanout.
//
// One process. One Postgres LISTEN connection. An HTTP server that holds
// long-lived SSE connections per authenticated user. When the DB sends
// a NOTIFY on the fc:state channel, this process fans it out to every
// subscriber owned by the same user_id.
//
// Listens on PORT (default 4001). Connection string from DATABASE_URL.
// Health endpoint at /healthz; SSE at /sse?token=ck_*.

import { createServer, IncomingMessage, ServerResponse } from "http";
import { Pool } from "pg";
import { URL } from "url";
import { validateToken } from "./auth.js";
import { ListenLoop } from "./listen.js";
import * as subs from "./subscriptions.js";
import type { ChangeEvent, Subscription } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "4001", 10);
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const HEARTBEAT_MS = 25_000; // every 25s — under most proxy idle timeouts (typically 30-60s)
const EVENT_BUFFER_SIZE = 1_000; // ring buffer for Last-Event-ID replay

if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL env var is required");
  process.exit(1);
}

// Auth queries use a small pool — short-lived per-request connections.
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

// Ring buffer of recent events for Last-Event-ID replay on reconnect.
// Per-user buffers would be more memory-efficient but the simple shared
// buffer with id-based filtering is fine at our scale.
const eventLog: Array<{ id: number; event: ChangeEvent }> = [];
let nextEventId = 1;

function logEvent(event: ChangeEvent): number {
  const id = nextEventId++;
  eventLog.push({ id, event });
  if (eventLog.length > EVENT_BUFFER_SIZE) eventLog.shift();
  return id;
}

function replayFor(userId: string, sinceId: number, res: ServerResponse): number {
  let lastSent = sinceId;
  for (const { id, event } of eventLog) {
    if (id <= sinceId) continue;
    if (event.u !== userId) continue;
    const frame = `id: ${id}\nevent: change\ndata: ${JSON.stringify(event)}\n\n`;
    try {
      res.write(frame);
      lastSent = id;
    } catch {
      return lastSent;
    }
  }
  return lastSent;
}

// ── HTTP routing ──────────────────────────────────────────────────────────

async function handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  const auth = await validateToken(pool, token).catch(() => null);
  if (!auth || !auth.ok) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Standard SSE headers. CORS open — the bridge sits on a different
  // origin than the Vercel app and the desktop app. Auth is the real gate.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering if proxied later
    "Access-Control-Allow-Origin": "*",
  });

  // Initial "you're connected" frame so the client knows auth succeeded
  // before any actual change event arrives.
  res.write(`event: hello\ndata: ${JSON.stringify({ userId: auth.userId, serverTime: Date.now() })}\n\n`);

  // Replay buffered events if the client sent Last-Event-ID.
  const lastIdHeader = req.headers["last-event-id"];
  const sinceId = lastIdHeader ? parseInt(Array.isArray(lastIdHeader) ? lastIdHeader[0]! : lastIdHeader, 10) : 0;
  const lastSentId = isFinite(sinceId) ? replayFor(auth.userId, sinceId, res) : 0;

  // Periodic heartbeat (SSE comment lines) so proxies and the OS don't
  // close the connection during long quiet stretches.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      // Will be cleaned up by the close handler.
    }
  }, HEARTBEAT_MS);

  const sub: Subscription = {
    userId: auth.userId,
    res,
    lastSentId,
    heartbeat,
  };
  subs.add(sub);
  console.log(`[sse] +${sub.userId.slice(0, 8)} (replay since=${sinceId}, conns=${subs.stats().connections})`);

  req.on("close", () => {
    subs.remove(sub);
    console.log(`[sse] -${sub.userId.slice(0, 8)} (conns=${subs.stats().connections})`);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      const { users, connections } = subs.stats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, users, connections, eventLogSize: eventLog.length }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/sse") {
      await handleSse(req, res);
      return;
    }
    // Allow OPTIONS preflight from browser apps cross-origin.
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Last-Event-ID",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  } catch (err) {
    console.error("[http] handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
});

// ── Wire LISTEN → fanout ──────────────────────────────────────────────────

const listenLoop = new ListenLoop(DATABASE_URL, (event: ChangeEvent) => {
  const id = logEvent(event);
  subs.fanout(event, id);
});

server.listen(PORT, () => {
  console.log(`[bridge] listening on http://localhost:${PORT}`);
  console.log(`[bridge] SSE endpoint: /sse?token=ck_*`);
  console.log(`[bridge] health: /healthz`);
});

// Fire-and-forget — start() runs forever (or until stop()).
listenLoop.start().catch((err) => {
  console.error("[bridge] LISTEN loop failed:", err);
  process.exit(1);
});

// Graceful shutdown so deploys don't leave zombie connections.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[bridge] received ${sig}, shutting down`);
    listenLoop.stop();
    server.close(() => {
      pool.end().catch(() => {});
      process.exit(0);
    });
    // Hard fail after 5s so a stuck connection doesn't block deploys.
    setTimeout(() => process.exit(1), 5_000).unref();
  });
}
