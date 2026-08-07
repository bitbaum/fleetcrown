/**
 * GET /api/terminal/context?channel=cloud|local
 *
 * Everything the terminal's mode bar needs, and nothing else: the agent
 * catalog (with runner-reported availability) plus, per open tab, the working
 * directory and the agent currently preferred there.
 *
 * Deliberately NOT `/api/control` — that route assembles git state, queues,
 * activity timelines and outcome streaks for every project. The terminal needs
 * three fields per tab. Reusing the heavy route would have made opening a
 * terminal cost a full Control refresh on a 5s cadence.
 *
 * SSOT is preserved: the catalog is built by the same
 * `buildSwitchableAgentCatalog` + runner-availability derivation the Control
 * route uses, and tab→dir comes from `user_projects` exactly as tab-inject
 * resolves it.
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { BUILDER_CHANNELS } from "@/lib/constants/statuses";
import { z } from "@/lib/api/route-helpers";
import { listAgentRegistry } from "@/lib/agent-registry";
import {
  buildSwitchableAgentCatalog,
  type AgentAvailabilityOverride,
  type AgentCatalog,
} from "@/lib/agent-catalog";
import { getUserProjects } from "@/db/queries/user-projects";
import { getRuntimeSnapshot } from "@/db/queries/runtime-snapshots";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";

export const runtime = "nodejs";

const Channel = z.enum(BUILDER_CHANNELS);

/** One open tab, resolved to the things the mode bar can act on. */
export type TerminalTabContext = {
  tab: string;
  /** Absolute project directory — required by /api/control/switch-agent. */
  dir: string | null;
  /** Preferred agent for this tab, if the project records one. */
  agentPref: string | null;
};

export type TerminalContext = {
  agents: AgentCatalog;
  tabs: TerminalTabContext[];
};

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Channel.safeParse(new URL(req.url).searchParams.get("channel"));
  const channel = parsed.success ? parsed.data : undefined;

  const [projects, snapshot] = await Promise.all([
    getUserProjects(userId).catch(() => []),
    getRuntimeSnapshot(userId, channel).catch(() => null),
  ]);
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);

  // Availability mirrors /api/control: on the local runtime host the adapters
  // detect themselves; on the control plane only the connected runner knows
  // what is installed, and a runner that reported nothing means "unknown",
  // which must read as usable rather than as a wall of disabled rows.
  const agentIds = listAgentRegistry().map((entry) => entry.id);
  const installedAgents = snapshot?.installedAgents ?? [];
  const availability: AgentAvailabilityOverride | undefined = isRuntimeAvailable()
    ? undefined
    : Object.fromEntries(
        agentIds.map((agent) => [agent, installedAgents.length === 0 || installedAgents.includes(agent)]),
      ) as AgentAvailabilityOverride;

  const agents = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent, availability);

  // Tab names are matched case-insensitively against project names — the same
  // rule /api/control/tab-inject uses to resolve a tab to a project.
  const byName = new Map(projects.map((p) => [p.name.toLowerCase(), p]));
  const tabs: TerminalTabContext[] = (snapshot?.openTabs ?? []).map((tab) => {
    const project = byName.get(tab.toLowerCase());
    return { tab, dir: project?.dirPath ?? null, agentPref: project?.agentPref ?? null };
  });

  return NextResponse.json({ agents, tabs } satisfies TerminalContext);
}
