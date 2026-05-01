import { execSync } from "child_process";
import fs from "fs";
import { type Agent, getAgentRegistryEntry } from "@/lib/agent-registry";
import { parseProjectsConf } from "@/lib/claude-config";

export type ProjectTab = {
  tab: string;
  dir: string;
};

export type SwitchTabResult = {
  tab: string;
  dir: string;
  command: string;
  status: "restarted" | "skipped" | "failed";
  error?: string;
};

function escapeTabValue(value: string): string {
  return value.replace(/'/g, `'"'"'`);
}

export function getConfiguredProjectTabs(): ProjectTab[] {
  return parseProjectsConf();
}

export function getOpenZellijTabs(): string[] {
  try {
    const out = execSync("zellij action query-tab-names 2>/dev/null || true", { encoding: "utf-8" });
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function restartTab(tab: string, command: string): void {
  execSync(`zellij action go-to-tab-name '${escapeTabValue(tab)}'`);
  execSync("sleep 0.2");
  execSync("zellij action write 3");
  execSync("sleep 0.1");
  execSync(`zellij action write-chars '${escapeTabValue(command)}'`);
  execSync("sleep 0.1");
  execSync("zellij action write 13");
}

export function restartOpenProjectTabs(commandForDir: (dir: string) => string): SwitchTabResult[] {
  const openTabs = new Set(getOpenZellijTabs().map((tab) => tab.toLowerCase()));

  return getConfiguredProjectTabs().map(({ tab, dir }) => {
    const command = commandForDir(dir);
    if (!openTabs.has(tab.toLowerCase())) {
      return { tab, dir, command, status: "skipped" as const };
    }

    try {
      restartTab(tab, command);
      return { tab, dir, command, status: "restarted" as const };
    } catch (error) {
      return {
        tab,
        dir,
        command,
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

let cwdCache: { key: string; cwds: string[]; builtAt: number } | null = null;

export function getAgentCwds(agent: Agent): string[] {
  const now = Date.now();
  if (cwdCache && cwdCache.key === agent && now - cwdCache.builtAt < 3000) {
    return cwdCache.cwds;
  }

  const matchers = getAgentRegistryEntry(agent).processMatchers;
  const cwds: string[] = [];

  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
        if (!matchers.some((matcher) => cmdline.includes(matcher))) continue;
        cwds.push(fs.readlinkSync(`/proc/${entry}/cwd`));
      } catch {
        // Ignore processes that disappeared mid-scan.
      }
    }
  } catch {
    // Ignore systems where /proc is unavailable.
  }

  cwdCache = { key: agent, cwds, builtAt: now };
  return cwds;
}
