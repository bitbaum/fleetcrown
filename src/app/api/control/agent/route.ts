import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { readAgentPreferences, resolveAgentConfig, writeAgentPreferences } from "@/lib/agent-preferences";
import { parseProjectsConf } from "@/lib/agent-config";
import { buildSwitchableAgentCatalog, type AgentCatalog } from "@/lib/agent-catalog";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const AGENT_IDS = ["codex", "claude"] as const;

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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildLaunchCommand(agent: "codex" | "claude", model: string, dir: string): string {
  const escapedDir = shellEscape(dir);
  if (agent === "claude") return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && claude`;
  return `source ~/.bashrc >/dev/null 2>&1 || true; cd ${escapedDir} && codex --model ${shellEscape(model)} --no-alt-screen`;
}

function applyToOpenTabs(agent: "codex" | "claude", model: string): SwitchTabResult[] {
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

  const projects = parseProjectsConf();
  if (projects.length === 0) {
    return [{ status: "skipped", reason: "No configured projects in ~/.config/claude-projects.conf." }];
  }

  const openSet = new Set(openTabs);
  return projects.map(({ tab, dir }) => {
    const command = buildLaunchCommand(agent, model, dir);
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

    return NextResponse.json({
      ok: true,
      config: resolveAgentConfig(next),
      preferences: next,
      tabResults: dataOrResp.applyToOpenTabs ? applyToOpenTabs(dataOrResp.agent, dataOrResp.model) : [],
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
