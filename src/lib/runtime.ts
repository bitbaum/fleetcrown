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

/** Error body when the cloud control plane must not spawn local PTYs (Horizon A2). */
export const WORKSPACES_CLOUD_DISABLED =
  "Local PTY workspaces are disabled on the cloud control plane. Watch agents on Terminal → Cloud (box-runner peek stream).";
