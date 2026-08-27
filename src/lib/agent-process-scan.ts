/**
 * Server-only /proc helpers for agent switching.
 * Imported by API routes and the desktop poller — not client components.
 */

import { getAgentProcesses } from "@/lib/control-fast-state";
import { listAgentRegistry, isAgentId, type Agent } from "@/lib/agent-registry";
import type { PaneCandidate } from "@/lib/terminals/tab-by-cwd";

/** Agent IDs with a live process whose cwd is inside `dir`. */
export function resolveRunningAgentsInDir(dir: string): Agent[] {
  const registry = listAgentRegistry();
  const processes = getAgentProcesses(registry);
  const ids = new Set<Agent>();
  for (const proc of processes) {
    if (!isAgentId(proc.agentId)) continue;
    if (proc.cwd === dir || proc.cwd.startsWith(`${dir}/`)) {
      ids.add(proc.agentId);
    }
  }
  return [...ids];
}

/** Pick the best outgoing agent: explicit hint if running, else first live process. */
export function resolveOutgoingAgentForDir(dir: string, hint?: string | null): Agent | null {
  const running = resolveRunningAgentsInDir(dir);
  if (hint && isAgentId(hint) && running.includes(hint)) return hint;
  return running[0] ?? (hint && isAgentId(hint) ? hint : null);
}

/** Every live agent process, reduced to what tab resolution needs. Lives here
 *  because this file already owns "scan /proc through the agent registry";
 *  the zellij adapter should not have to know what an agent registry is. */
export function listPaneCandidates(): PaneCandidate[] {
  return getAgentProcesses(listAgentRegistry()).map((p) => ({
    cwd: p.cwd,
    pid: p.pid,
    zellijPaneId: p.zellijPaneId,
    zellijSession: p.zellijSession,
  }));
}
