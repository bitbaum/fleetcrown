import { EventEmitter } from "events";

// Global singleton keyed on globalThis — survives Next.js hot-reload in dev.
const KEY = "$$cockpit_sse_bus";
if (!(globalThis as Record<string, unknown>)[KEY]) {
  const e = new EventEmitter();
  e.setMaxListeners(500);
  (globalThis as Record<string, unknown>)[KEY] = e;
}
export const sseBus: EventEmitter = (globalThis as Record<string, unknown>)[KEY] as EventEmitter;

// Called after any DB write to project_states so SSE subscribers wake immediately.
export function emitStateChanged(userId: string) {
  sseBus.emit(`state:${userId}`);
}

// Live-terminal frame fanout (docs/architecture/embedded-terminal.md). The
// runner POSTs a changed dump-screen frame to /api/control/peek-frame, which
// emits it here; the /api/control/peek-stream SSE for the same (user, tab)
// forwards it to the viewer. In-process only — fine on a single box instance;
// frames are too big/frequent for the Postgres-NOTIFY bridge.
export type PeekFrame = { seq: number; frame: string; at: number };

export function peekChannel(userId: string, tab: string): string {
  return `peek:${userId}:${tab.toLowerCase()}`;
}

export function emitPeekFrame(userId: string, tab: string, payload: PeekFrame): void {
  sseBus.emit(peekChannel(userId, tab), payload);
}

// Viewer ref-count per (user, tab): the first viewer triggers peek_start, the
// last triggers peek_stop, so the runner only streams a pane while watched.
const VKEY = "$$cockpit_peek_viewers";
if (!(globalThis as Record<string, unknown>)[VKEY]) {
  (globalThis as Record<string, unknown>)[VKEY] = new Map<string, number>();
}
const peekViewers = (globalThis as Record<string, unknown>)[VKEY] as Map<string, number>;

/** Register a viewer; returns true if this is the FIRST viewer (→ peek_start). */
export function addPeekViewer(userId: string, tab: string): boolean {
  const key = peekChannel(userId, tab);
  const n = (peekViewers.get(key) ?? 0) + 1;
  peekViewers.set(key, n);
  return n === 1;
}

/** Deregister a viewer; returns true if this was the LAST viewer (→ peek_stop). */
export function removePeekViewer(userId: string, tab: string): boolean {
  const key = peekChannel(userId, tab);
  const n = (peekViewers.get(key) ?? 1) - 1;
  if (n <= 0) { peekViewers.delete(key); return true; }
  peekViewers.set(key, n);
  return false;
}
