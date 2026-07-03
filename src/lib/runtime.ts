/**
 * Runtime availability — distinguishes the local machine (where zellij and agent
 * tools run) from the cloud control plane (the hosted server, where only DB-backed operations work).
 *
 * Set RUNTIME_AVAILABLE=true in .env.local on the home machine.
 * Do NOT set it in the cloud host's env vars — its absence is the signal.
 */
export function isRuntimeAvailable(): boolean {
  return process.env.RUNTIME_AVAILABLE === "true";
}

/** Server-owned sandbox workspaces are an explicit hosted-execution opt-in. */
export function isSandboxExecutorEnabled(): boolean {
  return process.env.FLEETCROWN_EXECUTOR === "sandbox";
}

/** Error body when the cloud control plane must not spawn local PTYs (Horizon A2). */
export const WORKSPACES_CLOUD_DISABLED =
  "Server workspaces are disabled on this control plane. Watch agents on Terminal → Cloud (box-runner peek stream), or connect Fleet Runner on this computer.";
