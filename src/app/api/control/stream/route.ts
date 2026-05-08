import { getUserProjects } from "@/db/queries/user-projects";
import { readAgentPreferences, resolveAgentConfig } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog } from "@/lib/agent-catalog";
import { parseProjectsConf, resolveEffectiveTab } from "@/lib/agent-config";
import { getAgentCwds, readFastState } from "@/lib/control-fast-state";
import { getZellijTabs } from "@/lib/zellij";
import { getCurrentUserId } from "@/lib/session";
import type { FastProjectState } from "@/lib/control-fast-state";

export const dynamic = "force-dynamic";

const TICK_MS = 2_000;
const KEEPALIVE_MS = 15_000;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const userId = await getCurrentUserId();
  const preferences = readAgentPreferences();
  const agentConfig = resolveAgentConfig(preferences);
  const agentRegistry = buildSwitchableAgentCatalog(preferences.models, agentConfig.agent);
  const allMatchers = agentRegistry.agents.flatMap((e) => e.processMatchers);

  const dbUserProjects = await getUserProjects(userId).catch(() => []);
  const confProjects = dbUserProjects.length > 0
    ? dbUserProjects.filter((p) => p.dirPath).map((p) => ({ tab: p.name, dir: p.dirPath! }))
    : parseProjectsConf();

  // Resolve each project's canonical tab name to its exact zellij casing once at stream start.
  // go-to-tab-name and /tmp sentinel files all use zellij exact casing — using conf casing
  // causes /tmp reads to miss updates until the 30s fallback poll catches up.
  const activeTabs = await getZellijTabs();
  const projects = confProjects.map(({ tab, dir }) => ({
    tab: resolveEffectiveTab(tab, activeTabs),
    dir,
  }));

  let lastSent: FastProjectState[] = [];
  let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const send = (text: string) => {
        try { controller.enqueue(enc.encode(text)); } catch { /* client disconnected */ }
      };

      const tick = () => {
        const agentCwds = getAgentCwds(allMatchers);
        const current = readFastState(projects, agentCwds);

        const changed = current.filter((proj, i) => {
          const prev = lastSent[i];
          if (!prev) return true;
          return (
            proj.agentRunning !== prev.agentRunning ||
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
      const agentCwds = getAgentCwds(allMatchers);
      lastSent = readFastState(projects, agentCwds);
      send(sseEvent("projects-update", { projects: lastSent }));
      scheduleKeepalive();

      // Tick loop
      const interval = setInterval(tick, TICK_MS);

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
