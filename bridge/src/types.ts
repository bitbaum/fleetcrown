// Shape of a NOTIFY payload from the fc:state channel (see
// drizzle/0022_notify_triggers.sql). Keys are short to satisfy Postgres's
// 8KB NOTIFY payload limit even when bursts pack into pg_notify batches.
export interface ChangeEvent {
  /** Short table name (e.g. "project_states"). */
  t: string;
  /** UUID of the user this row belongs to (routing key for fanout). */
  u: string;
  /** Row identifier (project_key, snapshot id, etc.). Used by clients
   *  to re-fetch the changed row if they need full content. */
  k: string;
  /** SQL op that fired the trigger. */
  op: "INSERT" | "UPDATE" | "DELETE";
  /** Unix seconds at NOTIFY emit time. */
  ts: number;
}

// ── Fast-lane (non-durable) events ──────────────────────────────────────────
// Mirror of src/lib/event-stream-types.ts (kept in sync at the IPC boundary —
// this package ships separately on Hetzner). Raw keystrokes / resizes ride the
// same fc:state NOTIFY channel, discriminated by `kind`, but are fanned out via
// a distinct SSE event name with NO id so they bypass the replay buffer.
export type BuilderChannel = "cloud" | "local";

export interface RawKeyEvent {
  kind: "rawkey";
  /** Owning user UUID — fan-out routing key. */
  u: string;
  /** Project tab; the runner maps it to its PTY. */
  tab: string;
  /** Raw bytes to write to the PTY, verbatim. */
  b: string;
  /** Target builder (box-runner vs desktop). Omit = any connected runner with a PTY. */
  ch?: BuilderChannel;
}

export interface ResizeEvent {
  kind: "resize";
  u: string;
  tab: string;
  c: number;
  r: number;
  ch?: BuilderChannel;
}

export type FastLaneEvent = RawKeyEvent | ResizeEvent;

/** An active SSE connection from a browser, desktop, or phone. */
export interface Subscription {
  /** UUID of the authenticated user. */
  userId: string;
  /** Node response object used to write SSE frames. */
  res: import("http").ServerResponse;
  /** Last event id sent to this client. Used for Last-Event-ID replay
   *  on reconnect (clients send it as a header; we replay anything we
   *  still have buffered with a higher id). */
  lastSentId: number;
  /** Heartbeat interval handle so we can clear it on disconnect. */
  heartbeat: NodeJS.Timeout;
}
