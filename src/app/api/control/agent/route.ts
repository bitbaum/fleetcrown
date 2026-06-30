import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readAgentPreferences, resolveAgentConfig, writeAgentPreferences } from "@/lib/agent-preferences";
import { buildSwitchableAgentCatalog, type AgentCatalog } from "@/lib/agent-catalog";
import { buildAgentLaunchCommand, AGENT_IDS, type Agent } from "@/lib/agent-registry";
import { shellEscape } from "@/lib/zellij";
import { getUserProjects, getOrgProjects } from "@/db/queries/user-projects";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { enqueueSwitchAgentCommand } from "@/db/queries/pending-commands";
import { resolveQueuedExecution } from "@/lib/execution-access";

const UpdateAgentBody = z.object({
  agent: z.enum(AGENT_IDS),
  model: z.string().trim().min(1, "model is required").max(120, "model too long"),
  applyToOpenTabs: z.boolean().optional(),
});

type SwitchTabResult = {
  tab?: string;
  dir?: string;
  command?: string;
  // "queued" is the cloud-mode outcome: a switch_agent pending_command was
  // enqueued for the local runner to execute. Local mode still uses
  // restarted/skipped/failed from the inline execSync path.
  status: "restarted" | "skipped" | "failed" | "queued";
  reason?: string;
  error?: string;
};

type AgentRegistry = AgentCatalog;

export async function GET() {
  const prefs = readAgentPreferences();
  const config = resolveAgentConfig(prefs);
  const registry: AgentRegistry = buildSwitchableAgentCatalog(prefs.models, config.agent);

  return NextResponse.json({ registry, config });
}

function applyToOpenTabs(agent: Agent, model: string, allProjects: { tab: string; dir: string }[]): SwitchTabResult[] {
  try {
    execSync("command -v zellij >/dev/null 2>&1");
  } catch {
    return [{ status: "failed", error: "zellij is not installed or not on PATH." }];
  }

  let openTabs: string[] = [];
  try {
    const out = execSync("zellij action query-tab-names 2>/dev/null || true", { encoding: "utf-8" });
    const ansiRe = /\x1b\[[0-9;]*m/g;
    openTabs = out
      .split("\n")
      .map((line) => line.replace(ansiRe, "").trim().toLowerCase())
      .filter((s) => s.length > 0 && !s.includes("[created "));
  } catch {
    return [{ status: "failed", error: "Failed to read open zellij tabs." }];
  }

  if (allProjects.length === 0) {
    return [{ status: "skipped", reason: "No configured projects found." }];
  }

  const openSet = new Set(openTabs);
  return allProjects.map(({ tab, dir }) => {
    const command = buildAgentLaunchCommand({ agent, model }, dir);
    if (!openSet.has(tab.toLowerCase())) return { tab, dir, command, status: "skipped" as const };
    try {
      execSync(`zellij action go-to-tab-name ${shellEscape(tab)}`);
      execSync("sleep 0.2");
      execSync("zellij action write 3");
      execSync("sleep 0.1");
      execSync(`zellij action write-chars ${shellEscape(command)}`);
      execSync("sleep 0.1");
      execSync("zellij action write 13");
      return { tab, dir, command, status: "restarted" as const };
    } catch (error) {
      return { tab, dir, command, status: "failed" as const, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, UpdateAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  try {
    const current = readAgentPreferences();
    const next = writeAgentPreferences({
      ...current,
      defaultAgent: dataOrResp.agent,
      models: {
        ...current.models,
        [dataOrResp.agent]: dataOrResp.model,
      },
    });

    let tabResults: SwitchTabResult[] = [];
    if (dataOrResp.applyToOpenTabs) {
      const userId = await getSessionUserId();
      if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const [dbProjects, dbTeamProjects] = await Promise.all([
        getUserProjects(userId).catch(() => []),
        getOrgProjects(userId).catch(() => []),
      ]);
      const seenDirs = new Set<string>();
      const allProjects = [...dbProjects, ...dbTeamProjects]
        .filter((p) => p.dirPath && !seenDirs.has(p.dirPath) && seenDirs.add(p.dirPath))
        .map((p) => ({ tab: p.name, dir: p.dirPath! }));

      if (!isRuntimeAvailable()) {
        // Cloud mode: instead of returning "skipped" and silently doing
        // nothing, queue a switch_agent command per project. The local
        // runner's execute_switch_agent (hardened in 0ccb43d/9a3bd61)
        // handles tab-not-open as a no-op via its quit signal path, so
        // queueing for every registered project is safe. Runner also
        // falls back to conf model if model is empty (9a3bd61).
        const execution = await resolveQueuedExecution(userId, { defaultChannel: "cloud" });
        if (!execution.ok) {
          tabResults = allProjects.map(({ tab, dir }) => ({
            tab,
            dir,
            status: "failed" as const,
            error: execution.message,
          }));
        } else {
          tabResults = await Promise.all(
            allProjects.map(async ({ tab, dir }): Promise<SwitchTabResult> => {
              try {
                await enqueueSwitchAgentCommand(userId, {
                  tab,
                  ...(execution.channel ? { channel: execution.channel } : {}),
                  dir,
                  toAgent: dataOrResp.agent,
                  model: dataOrResp.model,
                });
                return { tab, dir, status: "queued" as const };
              } catch (err) {
                return { tab, dir, status: "failed" as const, error: err instanceof Error ? err.message : String(err) };
              }
            }),
          );
        }
      } else {
        tabResults = applyToOpenTabs(dataOrResp.agent, dataOrResp.model, allProjects);
      }
    }

    return NextResponse.json({
      ok: true,
      config: resolveAgentConfig(next),
      preferences: next,
      tabResults,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
