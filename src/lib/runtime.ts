/**
 * Runtime availability — distinguishes the local machine (where zellij and agent
 * tools run) from the cloud control plane (Vercel, where only DB-backed operations work).
 *
 * Set RUNTIME_AVAILABLE=true in .env.local on the home machine.
 * Do NOT set it in Vercel env vars — its absence is the signal.
 */
export function isRuntimeAvailable(): boolean {
  return process.env.RUNTIME_AVAILABLE === "true";
}
