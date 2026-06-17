/**
 * Runner-side PTY execution — the Fleet Runner owning each agent's PTY directly
 * instead of puppeting zellij. Reuses the exact same Executor + launch helper the
 * server uses (src/lib/agent-execution), so a launch on the runner is byte-for-byte
 * the launch on the box: `bash -lic <registry launch command>` in an owned PTY.
 *
 * Why: a zellij `action go-to-tab-name` blocks forever on a detached session (a
 * headless/unattended laptop has no attached client), which is what made
 * launch/dispatch into revampit/kivvi time out. Owning the PTY removes the
 * dependency on an attached human terminal entirely.
 *
 * Gated by FLEETCROWN_RUNNER_PTY for launches/switches (safe rollout: the runner
 * falls back to zellij when off). Inject/dispatch/close route PTY-first per tab —
 * if a live owned workspace exists we drive it, else zellij — so a half-migrated
 * fleet (some agents in PTYs, some still in zellij) keeps working.
 */
import { executor } from "@/lib/agent-execution";
import { provisionAgentWorkspace } from "@/lib/agent-execution/launch";
import type { AgentOption } from "@/lib/agent-registry";

/** Master switch for PTY-owned launches. Default ON — owning the PTY is the only
 *  launch path that can't hang on a detached zellij session (the recurring
 *  ETIMEDOUT). Set FLEETCROWN_RUNNER_PTY=false to force the legacy zellij path.
 *  Launch/dispatch fall back to zellij automatically if a PTY spawn throws, so
 *  default-on can only improve reliability, never regress it. Inject/dispatch
 *  routing is per-tab (isPtyBacked) regardless, so existing zellij agents work. */
export const RUNNER_PTY_ENABLED = process.env.FLEETCROWN_RUNNER_PTY !== "false";

/**
 * Stable runner-local workspace id for a project tab. The runner has no server
 * userId locally, so it keys by tab; the cloud stream relay namespaces by the
 * runner's bearer token (→ userId) server-side.
 */
export function runnerWorkspaceId(tab: string): string {
  return `runner:${tab.toLowerCase()}`;
}

/** True when this tab is driven by a live FleetCrown-owned PTY (not zellij). */
export function isPtyBacked(tab: string): boolean {
  const handle = executor.get(runnerWorkspaceId(tab));
  return !!handle && handle.status !== "exited";
}

/**
 * The owned PTY's retained output as a single string, or null if no owned PTY.
 * Pure in-memory (executor.subscribe replays the ring buffer synchronously),
 * so it never blocks the event loop — unlike a zellij dump-screen. Used by the
 * one-shot peek so it shows the agent, not an empty/blocking zellij snapshot.
 */
export function peekPtyBuffer(tab: string): string | null {
  if (!isPtyBacked(tab)) return null;
  let buf = "";
  const unsub = executor.subscribe(runnerWorkspaceId(tab), 0, (e) => {
    if (e.kind === "output" && e.data) buf += e.data;
  });
  unsub();
  return buf;
}

/** Provision (or re-attach to) the agent's PTY. Idempotent per tab. */
export async function launchAgentPty(
  tab: string,
  dir: string,
  agent: AgentOption,
  model?: string,
): Promise<void> {
  await provisionAgentWorkspace("runner", {
    projectKey: tab,
    dir,
    agent,
    model,
    workspaceId: runnerWorkspaceId(tab),
  });
}

/** Write a prompt into the agent's PTY stdin (Enter-terminated). */
export function injectPty(tab: string, text: string): void {
  executor.write(runnerWorkspaceId(tab), text.endsWith("\r") ? text : `${text}\r`);
}

/** Kill the agent's PTY and release the workspace. */
export async function terminatePty(tab: string): Promise<void> {
  await executor.terminate(runnerWorkspaceId(tab));
}

/** Tabs currently backed by a live owned PTY (for the heartbeat's open-tabs). */
export function listPtyTabs(): string[] {
  const prefix = "runner:";
  return executor
    .list()
    .filter((h) => h.status !== "exited" && h.id.startsWith(prefix))
    .map((h) => h.id.slice(prefix.length));
}

/**
 * Resolve once the agent shows life (first running/idle event) so a paste lands
 * in the CLI prompt, not the boot banner. Mirrors the server's settle. Returns
 * false on timeout (caller injects anyway / retries).
 */
export function waitForPtyReady(tab: string, maxWaitMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const id = runnerWorkspaceId(tab);
    const cur = executor.get(id);
    if (cur && (cur.status === "running" || cur.status === "idle")) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(timer);
      resolve(v);
    };
    const unsub = executor.subscribe(id, 0, (e) => {
      if (e.kind === "status" && (e.status === "running" || e.status === "idle")) finish(true);
    });
    const timer = setTimeout(() => finish(false), maxWaitMs);
  });
}
