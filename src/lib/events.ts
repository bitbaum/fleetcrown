/**
 * Event schema — the contract between Worker, Bridge, and Brain.
 *
 * This file is the SSOT for the wire format of the event log. All three
 * layers of the system speak through events serialized as JSON lines:
 *
 *   Worker  →  appends to ~/.<APP_SLUG>/events.jsonl
 *   Bridge  →  tails the file, ships events to Brain
 *   Brain   →  projects events into state, decides, emits bridge.* commands
 *
 * Why a single union with a discriminator: every consumer of the log uses
 * the same parser, so a malformed line surfaces in exactly one place. Adding
 * a new event kind = appending to the union + bumping nothing else.
 *
 * Versioning: the v field on every envelope locks the wire format. v1 stays
 * stable; breaking changes ship as v2 with an at-rest migration of the log.
 */

import { z } from "zod";

export const EVENT_VERSION = 1;

// ── Shared field schemas ─────────────────────────────────────────────────────

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T/, "expected ISO 8601 timestamp");
const RunId = z.string().uuid();
const PaneId = z.string().min(1).max(120);
const Project = z.string().min(1).max(200);

/** Five session-handoff fields the agent writes to ~/.claude/sessions/<tab>.md */
export const Handoff = z.object({
  done:   z.string().default(""),
  next:   z.string().default(""),
  tests:  z.string().default(""),
  todos:  z.string().default(""),
  health: z.string().default(""),
});
export type Handoff = z.infer<typeof Handoff>;

/** Outcome categories — same union as orchestration_runs.outcome. */
export const OUTCOMES = ["success", "partial", "error", "hang", "user_abort", "timeout"] as const;
export const Outcome = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof Outcome>;

/** Autonomy levels — drives confidence-gated auto-dispatch in the brain. */
export const AUTONOMY = ["manual", "confirm", "auto", "sleep"] as const;
export const Autonomy = z.enum(AUTONOMY);
export type Autonomy = z.infer<typeof Autonomy>;

export const ADAPTERS = ["claude", "codex", "gemini", "openclaw"] as const;
export const Adapter = z.enum(ADAPTERS);
export type Adapter = z.infer<typeof Adapter>;

const Common = z.object({
  v:  z.literal(EVENT_VERSION),
  id: z.string().uuid(),
  ts: Iso,
});

// ── Worker events (worker → log) ─────────────────────────────────────────────
// Emitted by hooks in the agent's environment. The worker doesn't know who
// will read these — appending to the log is the entire contract.

export const WorkerStarted = Common.extend({
  kind:    z.literal("worker.started"),
  project: Project,
  adapter: Adapter,
  intent:  z.string().min(1).max(60),
  pane:    PaneId.optional(),
  /** Present when this run was initiated by a bridge.dispatch command. */
  runId:   RunId.optional(),
});

export const WorkerProgress = Common.extend({
  kind:    z.literal("worker.progress"),
  project: Project,
  pane:    PaneId.optional(),
  runId:   RunId.optional(),
  /** Free-form marker: "tests passing", "commit pushed", "deploy started", … */
  marker:  z.string().max(200),
});

export const WorkerIdle = Common.extend({
  kind:       z.literal("worker.idle"),
  project:    Project,
  pane:       PaneId.optional(),
  runId:      RunId.optional(),
  handoff:    Handoff,
  /** Wall-clock duration since worker.started, if known. */
  durationMs: z.number().int().nonnegative().optional(),
});

export const WorkerFinished = Common.extend({
  kind:       z.literal("worker.finished"),
  project:    Project,
  pane:       PaneId.optional(),
  runId:      RunId.optional(),
  handoff:    Handoff,
  outcome:    Outcome,
  durationMs: z.number().int().nonnegative(),
});

export const WorkerCrashed = Common.extend({
  kind:       z.literal("worker.crashed"),
  project:    Project,
  pane:       PaneId.optional(),
  runId:      RunId.optional(),
  error:      z.string().max(2000),
  durationMs: z.number().int().nonnegative().optional(),
});

// ── Bridge commands (brain → bridge → worker) ────────────────────────────────

export const BridgeDispatch = Common.extend({
  kind:       z.literal("bridge.dispatch"),
  project:    Project,
  intent:     z.string().min(1).max(60),
  /** Full rendered prompt text — what the worker actually receives. */
  prompt:     z.string().min(1).max(40000),
  runId:      RunId,
  autonomy:   Autonomy,
  /** Adapter the brain decided to use. Worker echoes onto worker.started so
   *  analytics + decide() see the truth instead of a hardcoded "claude". */
  adapter:    Adapter.optional(),
  /** Human-readable reason the brain chose this dispatch (audit + UI). */
  reason:     z.string().max(500).optional(),
  /** [0,1] confidence the dispatch is the right call. Sleep mode gates on this. */
  confidence: z.number().min(0).max(1).optional(),
});

export const BridgeCancel = Common.extend({
  kind:    z.literal("bridge.cancel"),
  project: Project,
  runId:   RunId,
  reason:  z.string().max(200),
});

// ── Brain outcomes (brain's persisted view, written after worker.finished) ───

export const BrainOutcome = Common.extend({
  kind:               z.literal("brain.outcome"),
  runId:              RunId,
  project:            Project,
  intent:             z.string().min(1).max(60),
  outcome:            Outcome,
  handoff:            Handoff.optional(),
  durationMs:         z.number().int().nonnegative(),
  dispatchReason:     z.string().max(500).optional(),
  dispatchConfidence: z.number().min(0).max(1).optional(),
});

// ── Union + parser ───────────────────────────────────────────────────────────

export const Event = z.discriminatedUnion("kind", [
  WorkerStarted,
  WorkerProgress,
  WorkerIdle,
  WorkerFinished,
  WorkerCrashed,
  BridgeDispatch,
  BridgeCancel,
  BrainOutcome,
]);
export type Event = z.infer<typeof Event>;
export type EventKind = Event["kind"];

export type ParseResult =
  | { ok: true;  event: Event }
  | { ok: false; error: string; raw: string };

/**
 * Parse one JSONL line into an Event, or return a structured error.
 * Returns error instead of throwing because the log may contain garbled
 * lines on disk corruption — consumers should skip those and keep going.
 */
export function parseEvent(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, error: "empty line", raw: line };
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `JSON parse: ${(e as Error).message}`, raw: trimmed };
  }
  const parsed = Event.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `schema: ${parsed.error.issues[0]?.message ?? "unknown"}`, raw: trimmed };
  }
  return { ok: true, event: parsed.data };
}

/** Serialize one event to a JSON line with trailing newline. */
export function serializeEvent(event: Event): string {
  return JSON.stringify(event) + "\n";
}
