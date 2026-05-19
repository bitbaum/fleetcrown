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
