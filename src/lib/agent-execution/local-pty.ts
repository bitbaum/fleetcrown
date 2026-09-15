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
 *
 * Everything that is not "how the process is born" lives in PtyExecutor, which
 * SandboxExecutor shares. All this class owns is the spawn.
 */
import { spawn, type IPty } from "node-pty";
import { PtyExecutor } from "./pty-executor";
import type { WorkspaceSpec } from "./types";

export { MAX_BUFFERED_EVENTS } from "./pty-executor";

export class LocalPtyExecutor extends PtyExecutor {
  protected async launch(spec: WorkspaceSpec): Promise<{ pty: IPty; meta: undefined }> {
    const pty = spawn(spec.command, spec.args ?? [], {
      name: "xterm-color",
      cwd: spec.cwd,
      cols: spec.cols ?? 120,
      rows: spec.rows ?? 32,
      env: { ...process.env, ...(spec.env ?? {}) } as Record<string, string>,
    });
    return { pty, meta: undefined };
  }
}
