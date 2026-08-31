/**
 * LocalPtyExecutor — the first real Executor: spawns each agent in a node-pty
 * PTY this process owns, on the local machine. Serves dev + single-box
 * self-host, and proves the whole interface end-to-end (PTY <-> browser xterm)
 * with ZERO zellij. The production SandboxExecutor implements the same interface
 * against Firecracker/gVisor/K8s/Fly/e2b without touching the control plane.
 *
 * Status is event-sourced from the owned process: output flowing => "running",
 * quiet for IDLE_MS => "idle", process exit => "exited". No /proc, no /tmp, no
 * screen-scraping — these are facts about a process we control.
 */
import { spawn, type IPty } from "node-pty";
import type {
  AgentEvent,
  AgentLifecycle,
  EventListener,
  Executor,
  Unsubscribe,
  WorkspaceHandle,
  WorkspaceId,
  WorkspaceSpec,
} from "./types";

/** Quiet period after which a workspace flips running -> idle (≈ "awaiting input"). */
const IDLE_MS = 1500;
/** Retained events per workspace for reconnect replay (ring buffer).
 *  Exported so SandboxExecutor uses the same replay depth. */
export const MAX_BUFFERED_EVENTS = 5000;

interface WorkspaceState {
  handle: WorkspaceHandle;
  pty: IPty | null; // null once exited
  buffer: AgentEvent[]; // ring buffer, trimmed to MAX_BUFFERED_EVENTS
  seq: number;
  listeners: Set<EventListener>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export class LocalPtyExecutor implements Executor {
  private workspaces = new Map<WorkspaceId, WorkspaceState>();

  async provision(spec: WorkspaceSpec): Promise<WorkspaceHandle> {
    const existing = this.workspaces.get(spec.id);
    if (existing && existing.handle.status !== "exited") {
      return existing.handle;
    }

    const pty = spawn(spec.command, spec.args ?? [], {
      name: "xterm-color",
      cwd: spec.cwd,
      cols: spec.cols ?? 120,
      rows: spec.rows ?? 32,
      env: { ...process.env, ...(spec.env ?? {}) } as Record<string, string>,
    });

    const state: WorkspaceState = {
      handle: { id: spec.id, status: "starting", startedAt: Date.now() },
      pty,
      buffer: [],
      seq: 0,
      listeners: new Set(),
      idleTimer: null,
    };
    this.workspaces.set(spec.id, state);

    pty.onData((data) => {
      this.setStatus(state, "running");
      this.emit(state, { kind: "output", data });
      this.armIdle(state);
    });

    pty.onExit(({ exitCode }) => {
      if (state.idleTimer) clearTimeout(state.idleTimer);
      state.idleTimer = null;
      state.pty = null;
      state.handle = { ...state.handle, status: "exited" };
      this.emit(state, { kind: "status", status: "exited" });
      this.emit(state, { kind: "exit", exitCode });
    });

    return state.handle;
  }

  write(id: WorkspaceId, data: string): void {
    const state = this.workspaces.get(id);
    if (state?.pty) state.pty.write(data);
  }

  resize(id: WorkspaceId, cols: number, rows: number): void {
    const state = this.workspaces.get(id);
    if (state?.pty) {
      try {
        state.pty.resize(cols, rows);
      } catch {
        /* pty may have just exited */
      }
    }
  }

  subscribe(id: WorkspaceId, sinceSeq: number, listener: EventListener): Unsubscribe {
    const state = this.workspaces.get(id);
    if (!state) return () => {};
    // Replay retained history first so a (re)connecting client catches up.
    for (const event of state.buffer) {
      if (event.seq > sinceSeq) listener(event);
    }
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  }

  get(id: WorkspaceId): WorkspaceHandle | null {
    return this.workspaces.get(id)?.handle ?? null;
  }

  list(): WorkspaceHandle[] {
    return [...this.workspaces.values()].map((s) => s.handle);
  }

  async terminate(id: WorkspaceId): Promise<void> {
    const state = this.workspaces.get(id);
    if (!state) return;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    try {
      state.pty?.kill();
    } catch {
      /* already dead */
    }
    state.pty = null;
    // Mark exited synchronously. pty.onExit may not fire for a beat, and a
    // re-provision of the same id (e.g. switching agents) must spawn fresh —
    // provision() returns the existing handle unless its status is "exited".
    if (state.handle.status !== "exited") {
      state.handle = { ...state.handle, status: "exited" };
      this.emit(state, { kind: "status", status: "exited" });
    }
  }

  // --- internals ---

  private emit(
    state: WorkspaceState,
    partial: Omit<AgentEvent, "workspaceId" | "seq" | "at">,
  ): void {
    const event: AgentEvent = {
      workspaceId: state.handle.id,
      seq: ++state.seq,
      at: Date.now(),
      ...partial,
    };
    state.buffer.push(event);
    if (state.buffer.length > MAX_BUFFERED_EVENTS) {
      state.buffer.splice(0, state.buffer.length - MAX_BUFFERED_EVENTS);
    }
    for (const listener of state.listeners) {
      try {
        listener(event);
      } catch {
        /* a bad listener must not break the stream */
      }
    }
  }

  private setStatus(state: WorkspaceState, status: AgentLifecycle): void {
    if (state.handle.status === status || state.handle.status === "exited") return;
    state.handle = { ...state.handle, status };
    this.emit(state, { kind: "status", status });
  }

  private armIdle(state: WorkspaceState): void {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => this.setStatus(state, "idle"), IDLE_MS);
  }
}
