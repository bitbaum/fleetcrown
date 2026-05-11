import { execSync } from "child_process";
import { buildAgentOptionLaunchCommand, type AgentOption } from "@/lib/agent-registry";

function escapeTabValue(value: string): string {
  return value.replace(/'/g, `'"'"'`);
}

function getOpenZellijTabs(): string[] {
  try {
    const out = execSync("zellij action query-tab-names 2>/dev/null || true", { encoding: "utf-8" });
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function ensureTabExists(tab: string): void {
  const open = getOpenZellijTabs();
  if (!open.some((t) => t.toLowerCase() === tab.toLowerCase())) {
    execSync(`zellij action new-tab --name '${escapeTabValue(tab)}'`);
    execSync("sleep 0.5");
  }
}

function restartTab(tab: string, command: string): void {
  execSync(`zellij action go-to-tab-name '${escapeTabValue(tab)}'`);
  execSync("sleep 0.2");
  execSync("zellij action write 3");
  execSync("sleep 0.1");
  execSync(`zellij action write-chars '${escapeTabValue(command)}'`);
  execSync("sleep 0.1");
  execSync("zellij action write 13");
}

export function launchAgentInTab(tab: string, dir: string, agent: AgentOption, model?: string): void {
  ensureTabExists(tab);
  const command = buildAgentOptionLaunchCommand({ agent, model }, dir);
  restartTab(tab, command);
}
