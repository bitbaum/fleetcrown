// Single Postgres LISTEN connection multiplexed across all subscribers.
//
// We use one dedicated client (not a pool) because LISTEN holds the
// connection for as long as the bridge runs. The pool is fine for
// short-lived auth queries; the LISTEN client is its own thing.
//
// On disconnect we reconnect with exponential backoff. The DB going
// away briefly should not require manual restart of the bridge — the
// process should recover.

import { Client } from "pg";
import type { ChangeEvent, FastLaneEvent } from "./types.js";

const CHANNEL = "fc:state";
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 30_000;

type Listener = (event: ChangeEvent | FastLaneEvent) => void;

export class ListenLoop {
  private client: Client | null = null;
  private stopped = false;
  private reconnectMs = RECONNECT_MIN_MS;

  constructor(
    private readonly connectionString: string,
    private readonly onEvent: Listener,
  ) {}

  async start(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.openOnce();
        // openOnce only returns on disconnect (or stop()). Reset backoff.
        this.reconnectMs = RECONNECT_MIN_MS;
      } catch (err) {
        console.warn(`[listen] connection failed: ${(err as Error).message}`);
      }
      if (this.stopped) return;
      console.warn(`[listen] reconnecting in ${this.reconnectMs}ms`);
      await sleep(this.reconnectMs);
      this.reconnectMs = Math.min(this.reconnectMs * 2, RECONNECT_MAX_MS);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.client) {
      this.client.end().catch(() => {});
      this.client = null;
    }
  }

  /** Open a single LISTEN connection. Returns when the connection ends
   *  (either by stop() or by a network failure). Errors propagate to
   *  the start() loop which handles backoff. */
  private async openOnce(): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    this.client = client;

    await client.connect();
    console.log(`[listen] connected to Postgres, listening on '${CHANNEL}'`);
    await client.query(`LISTEN "${CHANNEL}"`);

    return new Promise<void>((resolve, reject) => {
      client.on("notification", (msg) => {
        if (msg.channel !== CHANNEL) return;
        if (!msg.payload) return;
        try {
          const parsed = JSON.parse(msg.payload) as Record<string, unknown>;
          // Fast-lane (non-durable) events carry a `kind` and no SQL op — route
          // them straight through; the server fans them out without buffering.
          if (parsed.kind === "rawkey" || parsed.kind === "resize") {
            if (typeof parsed.u !== "string" || typeof parsed.tab !== "string") return;
            this.onEvent(parsed as unknown as FastLaneEvent);
            return;
          }
          const event = parsed as unknown as ChangeEvent;
          if (!event.t || !event.u || !event.op) return; // malformed; skip
          this.onEvent(event);
        } catch (err) {
          console.warn(`[listen] malformed payload: ${(err as Error).message}`);
        }
      });
      client.on("error", (err) => {
        console.warn(`[listen] client error: ${err.message}`);
        // Resolve (not reject) so the outer loop reconnects without
        // surfacing the error as a fatal start() failure.
        resolve();
      });
      client.on("end", () => {
        console.log("[listen] connection ended");
        resolve();
      });
      if (this.stopped) {
        client.end().catch(() => {});
        reject(new Error("stopped before connection completed"));
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
