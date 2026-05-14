import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readAgentPreferences, resolveAgentConfig, writeAgentPreferences } from "@/lib/agent-preferences";
import { parseProjectsConf } from "@/lib/agent-config";
import { buildSwitchableAgentCatalog, type AgentCatalog } from "@/lib/agent-catalog";
import { buildAgentLaunchCommand, AGENT_IDS, type Agent } from "@/lib/agent-registry";
import { shellEscape } from "@/lib/zellij";
import { getUserProjects } from "@/db/queries/user-projects";
import { getCurrentUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";

const UpdateAgentBody = z.object({
  agent: z.enum(AGENT_IDS),
  model: z.string().trim().min(1, "model is required").max(120, "model too long"),
  applyToOpenTabs: z.boolean().optional(),
});

type SwitchTabResult = {
  tab?: string;
  dir?: string;
  command?: string;
  status: "restarted" | "skipped" | "failed";
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
    openTabs = out.split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean);
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
      if (!isRuntimeAvailable()) {
        tabResults = [{ status: "skipped", reason: "Local runtime not available — cannot restart zellij tabs remotely." }];
      } else {
        // Merge conf-file projects with DB projects so DB-only projects are restarted too.
        const confProjects = parseProjectsConf();
        const confTabs = new Set(confProjects.map((p) => p.tab.toLowerCase()));
        const userId = await getCurrentUserId();
        const dbProjects = await getUserProjects(userId).catch(() => []);
        const dbOnlyProjects = dbProjects
          .filter((p) => p.dirPath && !confTabs.has(p.name.toLowerCase()))
          .map((p) => ({ tab: p.name, dir: p.dirPath! }));
        tabResults = applyToOpenTabs(dataOrResp.agent, dataOrResp.model, [...confProjects, ...dbOnlyProjects]);
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
