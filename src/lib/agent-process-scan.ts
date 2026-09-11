/**
 * Server-only /proc helpers for agent switching.
 * Imported by API routes and the desktop poller — not client components.
 */

import { getAgentProcesses } from "@/lib/control-fast-state";
import { listAgentRegistry, isAgentId, type Agent } from "@/lib/agent-registry";

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
