/**
 * SandboxExecutor — Docker-backed implementation of the Executor interface.
 *
 * This is Stage 3 of the execution-substrate migration: the control plane still
 * talks to `Executor`, but the process is now born inside an isolated container
 * with explicit resource limits and workspace-root enforcement. It is not a
 * public-hosted-execution entitlement by itself; product gates still decide who
 * may use hosted execution. This class is the substrate those gates can safely
 * point at.
 */
import { spawn, type IPty } from "node-pty";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
import { MAX_BUFFERED_EVENTS } from "./local-pty";

const IDLE_MS = 1500;

export type SandboxNetwork = "none" | "bridge";
export type SandboxUser = "current" | "root";
export type SandboxMountMode = "rw" | "ro";

export interface SandboxExecutorConfig {
  runtime: "docker";
  image: string;
  workspaceRoot: string;
  network: SandboxNetwork;
  cpus: string;
  memory: string;
  pidsLimit: string;
  user: SandboxUser;
  mountMode: SandboxMountMode;
  extraRunArgs: string[];
}

interface WorkspaceState {
  handle: WorkspaceHandle;
  pty: IPty | null;
  containerName: string;
  buffer: AgentEvent[];
  seq: number;
  listeners: Set<EventListener>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

function envValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function resolveSandboxConfig(): SandboxExecutorConfig {
  return {
    runtime: "docker",
    image: envValue("FLEETCROWN_SANDBOX_IMAGE", "ubuntu:24.04"),
    workspaceRoot: path.resolve(envValue("FLEETCROWN_SANDBOX_WORKSPACE_ROOT", path.join(os.homedir(), "dev"))),
    network: envValue("FLEETCROWN_SANDBOX_NETWORK", "none") === "bridge" ? "bridge" : "none",
    cpus: envValue("FLEETCROWN_SANDBOX_CPUS", "2"),
    memory: envValue("FLEETCROWN_SANDBOX_MEMORY", "4g"),
    pidsLimit: envValue("FLEETCROWN_SANDBOX_PIDS", "512"),
    user: envValue("FLEETCROWN_SANDBOX_USER", "current") === "root" ? "root" : "current",
    mountMode: envValue("FLEETCROWN_SANDBOX_MOUNT", "rw") === "ro" ? "ro" : "rw",
    extraRunArgs: (process.env.FLEETCROWN_SANDBOX_DOCKER_ARGS ?? "").split(/\s+/).filter(Boolean),
  };
}

export function sandboxContainerName(id: WorkspaceId): string {
  const hash = createHash("sha256").update(id).digest("hex").slice(0, 24);
  return `fc-ws-${hash}`;
}

export function assertSandboxCwdAllowed(cwd: string, workspaceRoot: string): string {
  const resolved = path.resolve(cwd);
  const root = path.resolve(workspaceRoot);
  const rel = path.relative(root, resolved);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return resolved;
  throw new Error(`Sandbox cwd ${resolved} is outside FLEETCROWN_SANDBOX_WORKSPACE_ROOT (${root})`);
}

export function buildDockerRunArgs(
  spec: WorkspaceSpec,
  config: SandboxExecutorConfig,
  containerName = sandboxContainerName(spec.id),
): string[] {
  const cwd = assertSandboxCwdAllowed(spec.cwd, config.workspaceRoot);
  const userArgs = config.user === "current" ? ["--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`] : [];
  const envArgs = Object.entries(spec.env ?? {}).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
  const mountSuffix = config.mountMode === "ro" ? ":ro" : ":rw";

  return [
    "run",
    "--rm",
    "-i",
    "--name",
    containerName,
    "--workdir",
    "/workspace",
    "--mount",
    `type=bind,src=${cwd},dst=/workspace${mountSuffix}`,
    "--network",
    config.network,
    "--cpus",
    config.cpus,
    "--memory",
    config.memory,
    "--pids-limit",
    config.pidsLimit,
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--env",
    "TERM=xterm-256color",
    "--env",
    "HOME=/tmp",
    ...userArgs,
    ...envArgs,
    ...config.extraRunArgs,
    config.image,
    spec.command,
    ...(spec.args ?? []),
  ];
}

export class SandboxExecutor implements Executor {
  private workspaces = new Map<WorkspaceId, WorkspaceState>();

  constructor(private readonly config = resolveSandboxConfig()) {}

  async provision(spec: WorkspaceSpec): Promise<WorkspaceHandle> {
    const existing = this.workspaces.get(spec.id);
    if (existing && existing.handle.status !== "exited") return existing.handle;
    if (!fs.existsSync(spec.cwd)) throw new Error(`Sandbox cwd does not exist: ${spec.cwd}`);

    const containerName = sandboxContainerName(spec.id);
    const args = buildDockerRunArgs(spec, this.config, containerName);
    const pty = spawn(this.config.runtime, args, {
      name: "xterm-color",
      cwd: this.config.workspaceRoot,
      cols: spec.cols ?? 120,
      rows: spec.rows ?? 32,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? os.homedir() },
    });

    const state: WorkspaceState = {
      handle: { id: spec.id, status: "starting", startedAt: Date.now() },
      pty,
      containerName,
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
      try { state.pty.resize(cols, rows); } catch { /* pty may have just exited */ }
    }
  }

  subscribe(id: WorkspaceId, sinceSeq: number, listener: EventListener): Unsubscribe {
    const state = this.workspaces.get(id);
    if (!state) return () => {};
    for (const event of state.buffer) {
      if (event.seq > sinceSeq) listener(event);
    }
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
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
    try { state.pty?.kill(); } catch { /* already dead */ }
    state.pty = null;
    if (state.handle.status !== "exited") {
      state.handle = { ...state.handle, status: "exited" };
      this.emit(state, { kind: "status", status: "exited" });
    }
    // Best effort: node-pty kill usually stops docker run; this catches a
    // detached container if Docker needed an extra nudge.
    try {
      const { execFile } = await import("node:child_process");
      await new Promise<void>((resolve) => {
        execFile(this.config.runtime, ["rm", "-f", state.containerName], { timeout: 5000 }, () => resolve());
      });
    } catch { /* docker unavailable or already removed */ }
  }

  private emit(state: WorkspaceState, partial: Omit<AgentEvent, "workspaceId" | "seq" | "at">): void {
    const event: AgentEvent = {
      workspaceId: state.handle.id,
      seq: ++state.seq,
      at: Date.now(),
      ...partial,
    };
    state.buffer.push(event);
    if (state.buffer.length > MAX_BUFFERED_EVENTS) state.buffer.splice(0, state.buffer.length - MAX_BUFFERED_EVENTS);
    for (const listener of state.listeners) {
      try { listener(event); } catch { /* listener isolation */ }
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
