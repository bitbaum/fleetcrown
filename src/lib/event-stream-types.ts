// Shared types for the FleetCrown event bridge.
//
// Two surfaces consume the bridge SSE: the web client in src/lib/event-stream.ts
// (browser EventSource) and the desktop client in desktop/src/main/bridge-subscriber.ts
// (Node EventSource). They both decode the same `change` frame, so they MUST
// share the same payload shape — drift between them is the kind of bug that
// silently breaks half the platform.
//
// The bridge itself (bridge/src/types.ts) keeps its own copy because it ships as
// a separate package on Hetzner with no path back to src/. That duplication is
// intentional and lives at the IPC boundary — server vs. consumers. If you
// change ChangeEvent here you must change it there too; consider it the wire
// format contract.

/** Payload of a single SSE `change` frame emitted by the bridge.
 *  Mirrors the NOTIFY payload defined in drizzle/0022_notify_triggers.sql. */
export interface ChangeEvent {
  /** Short table name — "project_states", "pending_commands", "runtime_snapshots", etc. */
  t: string;
  /** Owning user UUID. The bridge filters fan-out by this; consumers receive
   *  only their own events. Treat it as informational, not a routing key. */
  u: string;
  /** Row identifier — project_key, command id, snapshot id, etc. Consumers
   *  re-fetch the changed row by this key when they need the full content. */
  k: string;
  /** SQL operation that fired the trigger. */
  op: "INSERT" | "UPDATE" | "DELETE";
  /** Unix seconds at NOTIFY emit time. */
  ts: number;
}

/** Short table-name constants for ChangeEvent.t. Use these instead of
 *  literal strings so a typo at a callsite becomes a type error rather
 *  than a silently-ignored event. */
export const TABLE_PROJECT_STATES     = "project_states";
export const TABLE_RUNTIME_SNAPSHOTS  = "runtime_snapshots";
export const TABLE_PENDING_COMMANDS   = "pending_commands";
export const TABLE_ORCHESTRATION_RUNS = "orchestration_runs";
export const TABLE_BEACON_SETTINGS    = "beacon_settings";

/** Union of every table the bridge currently notifies on. Adding a new
 *  table to drizzle/0022_notify_triggers.sql must extend this union — the
 *  type guard `isKnownTable` below is the single check enforcing it. */
export type NotifiedTable =
  | typeof TABLE_PROJECT_STATES
  | typeof TABLE_RUNTIME_SNAPSHOTS
  | typeof TABLE_PENDING_COMMANDS
  | typeof TABLE_ORCHESTRATION_RUNS
  | typeof TABLE_BEACON_SETTINGS;

export function isKnownTable(t: string): t is NotifiedTable {
  return (
    t === TABLE_PROJECT_STATES ||
    t === TABLE_RUNTIME_SNAPSHOTS ||
    t === TABLE_PENDING_COMMANDS ||
    t === TABLE_ORCHESTRATION_RUNS ||
    t === TABLE_BEACON_SETTINGS
  );
}

// ── Fast-lane (non-durable) events ──────────────────────────────────────────
//
// Terminal interactivity needs cloud→runner transport for raw keystrokes and
// resizes. These must NOT be durable: a per-key `pending_commands` row is
// catastrophic, and a replayed keystroke on reconnect is wrong. So they ride
// the SAME `fc:state` NOTIFY channel as ChangeEvents but are discriminated by a
// `kind` field, and the bridge fans them out via a distinct SSE event name with
// NO id — so they bypass the durable row path AND the Last-Event-ID replay
// buffer. Keys are short to respect Postgres's 8KB NOTIFY payload limit.
//
// The channel name is the contract between the DB publisher (bridge-publish.ts),
// the bridge consumer (bridge/src/listen.ts CHANNEL), and the runner. Keep them
// in sync.
export const BRIDGE_NOTIFY_CHANNEL = "fc:state";

// Re-exported from the constants SSOT so existing importers keep working.
import type { BuilderChannel } from "@/lib/constants/statuses";
export type { BuilderChannel };

/** A raw terminal keystroke (verbatim bytes) bound for the runner's PTY. */
export interface RawKeyEvent {
  kind: "rawkey";
  /** Owning user UUID — the bridge's fan-out routing key. */
  u: string;
  /** Project tab; the runner maps it to its PTY via runnerWorkspaceId(tab). */
  tab: string;
  /** Raw bytes to write to the PTY, verbatim (no CR/prompt semantics). */
  b: string;
  /** Target builder (box-runner vs desktop). Omit = any connected runner with a PTY. */
  ch?: BuilderChannel;
}

/** A terminal resize bound for the runner's PTY. */
export interface ResizeEvent {
  kind: "resize";
  u: string;
  tab: string;
  /** Columns. */
  c: number;
  /** Rows. */
  r: number;
  ch?: BuilderChannel;
}

export type FastLaneEvent = RawKeyEvent | ResizeEvent;
