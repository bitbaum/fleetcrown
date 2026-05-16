import { ensureUserProjectEntityLinks } from "@/db/queries/user-projects";
import { getProjectStatesByUserId } from "@/db/queries/project-states";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog } from "@/lib/agent-catalog";
import { parseProjectsConf, resolveEffectiveTab } from "@/lib/agent-config";
import { getAgentProcesses, readFastState } from "@/lib/control-fast-state";
import { getZellijTabs } from "@/lib/zellij";
import { getCurrentUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import type { FastProjectState } from "@/lib/control-fast-state";

export const dynamic = "force-dynamic";

const TICK_MS = 2_000;
const KEEPALIVE_MS = 15_000;

// Map DB state rows to the FastProjectState shape the SSE client expects.
// Used on Vercel where /proc and /tmp are unavailable — daemon keeps DB current.
function dbToFastState(
  confProjects: Array<{ tab: string }>,
  dbRows: DbProjectState[]
): FastProjectState[] {
  const byKey = new Map(dbRows.map((r) => [r.projectKey.toLowerCase(), r]));
  return confProjects.map(({ tab }) => {
    const r = byKey.get(tab.toLowerCase());
    if (!r) return { tab, agentRunning: false, tabOpen: false, activeAgents: [], session: null, currentPrompt: null, readyAt: null, lockAt: null, closingAt: null, closedAt: null };
    return {
      tab,
      agentRunning: r.agentRunning,
      tabOpen: r.tabOpen,
      activeAgents: r.activeAgents,
      session: r.sessionDone || r.sessionNext
        ? { done: r.sessionDone ?? "", next: r.sessionNext ?? "", tests: r.sessionTests ?? "", todos: r.sessionTodos ?? "", health: r.sessionHealth ?? "", mtime: r.sessionUpdatedAt?.getTime() ?? 0 }
        : null,
      currentPrompt: r.currentPromptKey
        ? { key: r.currentPromptKey, label: r.currentPromptLabel ?? r.currentPromptKey, startedAt: r.currentPromptStartedAt ? Math.floor(r.currentPromptStartedAt.getTime() / 1000) : 0, source: "inject" as const }
        : null,
      readyAt:   r.readyAt   ? Math.floor(r.readyAt.getTime()   / 1000) : null,
      lockAt:    r.lockAt    ? Math.floor(r.lockAt.getTime()    / 1000) : null,
      closingAt: r.closingAt ? Math.floor(r.closingAt.getTime() / 1000) : null,
      closedAt:  r.closedAt  ? Math.floor(r.closedAt.getTime()  / 1000) : null,
    };
  });
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const userId = await getCurrentUserId();
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);
  const agentRegistry = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent);

  const dbUserProjects = await ensureUserProjectEntityLinks(userId).catch(() => []);
  const confProjects = dbUserProjects.length > 0
    ? dbUserProjects.filter((p) => p.dirPath).map((p) => {
        const agentId = p.agentPref ?? agentConfig.agent;
        const agent = agentRegistry.agents.find((entry) => entry.id === agentId);
        return {
          tab: p.name,
          dir: p.dirPath!,
          sessionLifecycleSignals: agent?.capabilities.sessionLifecycleSignals ?? false,
        };
      })
    : parseProjectsConf().map((p) => ({
        ...p,
        sessionLifecycleSignals: agentRegistry.agents.find((entry) => entry.id === agentConfig.agent)?.capabilities.sessionLifecycleSignals ?? false,
      }));

  // Resolve each project's canonical tab name to its exact zellij casing.
  // The cache is refreshed every 10s in the background so new Claude sessions
  // or tab renames don't leave the stream reading stale /tmp sentinel paths.
  let zellijTabCache = await getZellijTabs();
  let lastTabRefreshMs = Date.now();

  const TAB_CACHE_TTL_MS = 10_000;

  const refreshTabsCacheIfStale = () => {
    if (Date.now() - lastTabRefreshMs < TAB_CACHE_TTL_MS) return;
    lastTabRefreshMs = Date.now();
    getZellijTabs().then((tabs) => { zellijTabCache = tabs; }).catch(() => {});
  };

  let lastSent: FastProjectState[] = [];
  let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;

  const scanProjects = () => {
    const agentProcesses = getAgentProcesses(agentRegistry.agents);
    const projects = confProjects.map(({ tab, dir, sessionLifecycleSignals }) => {
      const resolvedTab = resolveEffectiveTab(tab, zellijTabCache);
      const projectProcesses = agentProcesses.filter((p) => p.cwd === dir || p.cwd.startsWith(dir + "/"));
      return {
        tab: resolvedTab,
        dir,
        activeAgents: [...new Set(projectProcesses.map((p) => p.agentId))],
        sessionLifecycleSignals: projectProcesses.length > 0
          ? projectProcesses.some((p) => p.sessionLifecycleSignals)
          : sessionLifecycleSignals,
        tabOpen: zellijTabCache.some((t) => t.toLowerCase() === resolvedTab.toLowerCase()),
      };
    });
    const agentCwds = agentProcesses.map((p) => p.cwd);
    return readFastState(projects, agentCwds);
  };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (text: string) => {
        try { controller.enqueue(enc.encode(text)); } catch { /* client disconnected */ }
      };

      const tick = async () => {
        refreshTabsCacheIfStale();
        const current = isRuntimeAvailable()
          ? scanProjects()
          : dbToFastState(confProjects, await getProjectStatesByUserId(userId).catch((): DbProjectState[] => []));

        const changed = current.filter((proj, i) => {
          const prev = lastSent[i];
          if (!prev) return true;
          return (
            proj.agentRunning !== prev.agentRunning ||
            proj.tabOpen !== prev.tabOpen ||
            proj.readyAt !== prev.readyAt ||
            proj.closingAt !== prev.closingAt ||
            proj.closedAt !== prev.closedAt ||
            proj.currentPrompt?.key !== prev.currentPrompt?.key ||
            proj.currentPrompt?.startedAt !== prev.currentPrompt?.startedAt ||
            proj.session?.mtime !== prev.session?.mtime
          );
        });

        if (changed.length > 0) {
          lastSent = current;
          send(sseEvent("projects-update", { projects: current }));
          if (keepaliveTimer) { clearTimeout(keepaliveTimer); keepaliveTimer = null; }
          scheduleKeepalive();
        }
      };

      const scheduleKeepalive = () => {
        keepaliveTimer = setTimeout(() => {
          send(": keepalive\n\n");
          scheduleKeepalive();
        }, KEEPALIVE_MS);
      };

      // Initial snapshot
      const initialProjects = isRuntimeAvailable()
        ? scanProjects()
        : dbToFastState(confProjects, await getProjectStatesByUserId(userId).catch((): DbProjectState[] => []));
      lastSent = initialProjects;
      send(sseEvent("projects-update", { projects: lastSent }));
      scheduleKeepalive();

      // Tick loop
      const interval = setInterval(() => { tick().catch(() => {}); }, TICK_MS);

      // Cleanup when stream is cancelled
      return () => {
        clearInterval(interval);
        if (keepaliveTimer) clearTimeout(keepaliveTimer);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
