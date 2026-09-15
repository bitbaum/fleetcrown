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
import type { WorkspaceId, WorkspaceSpec } from "./types";
import { PtyExecutor, type PtyWorkspaceState } from "./pty-executor";

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

/** All this backend remembers beyond the shared PTY state. */
type SandboxMeta = { containerName: string };

function envValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function resolveSandboxConfig(): SandboxExecutorConfig {
  return {
    runtime: "docker",
    image: envValue("LOKI_SANDBOX_IMAGE", "ubuntu:24.04"),
    workspaceRoot: path.resolve(
      envValue("LOKI_SANDBOX_WORKSPACE_ROOT", path.join(os.homedir(), "dev")),
    ),
    network: envValue("LOKI_SANDBOX_NETWORK", "none") === "bridge" ? "bridge" : "none",
    cpus: envValue("LOKI_SANDBOX_CPUS", "2"),
    memory: envValue("LOKI_SANDBOX_MEMORY", "4g"),
    pidsLimit: envValue("LOKI_SANDBOX_PIDS", "512"),
    user: envValue("LOKI_SANDBOX_USER", "current") === "root" ? "root" : "current",
    mountMode: envValue("LOKI_SANDBOX_MOUNT", "rw") === "ro" ? "ro" : "rw",
    extraRunArgs: (process.env.LOKI_SANDBOX_DOCKER_ARGS ?? "").split(/\s+/).filter(Boolean),
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
  throw new Error(`Sandbox cwd ${resolved} is outside LOKI_SANDBOX_WORKSPACE_ROOT (${root})`);
}

export function buildDockerRunArgs(
  spec: WorkspaceSpec,
  config: SandboxExecutorConfig,
  containerName = sandboxContainerName(spec.id),
): string[] {
  const cwd = assertSandboxCwdAllowed(spec.cwd, config.workspaceRoot);
  const userArgs =
    config.user === "current"
      ? ["--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`]
      : [];
  const envArgs = Object.entries(spec.env ?? {}).flatMap(([key, value]) => [
    "--env",
    `${key}=${value}`,
  ]);
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

export class SandboxExecutor extends PtyExecutor<SandboxMeta> {
  constructor(private readonly config = resolveSandboxConfig()) {
    super();
  }

  protected async launch(spec: WorkspaceSpec): Promise<{ pty: IPty; meta: SandboxMeta }> {
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

    return { pty, meta: { containerName } };
  }

  /** Best effort: node-pty kill usually stops docker run; this catches a
   *  detached container if Docker needed an extra nudge. */
  protected async afterTerminate(state: PtyWorkspaceState<SandboxMeta>): Promise<void> {
    try {
      const { execFile } = await import("node:child_process");
      await new Promise<void>((resolve) => {
        execFile(
          this.config.runtime,
          ["rm", "-f", state.meta.containerName],
          { timeout: 5000 },
          () => resolve(),
        );
      });
    } catch {
      /* docker unavailable or already removed */
    }
  }
}
