import { execSync } from "child_process";
import { buildAgentOptionLaunchCommand, type AgentOption } from "@/lib/agent-registry";

function escapeTabValue(value: string): string {
  return value.replace(/'/g, `'"'"'`);
}

/**
 * Find the Zellij session that contains a tab with the given name.
 * If ZELLIJ_SESSION_NAME is already set in the environment (i.e., the server
 * process is running inside a Zellij pane), that session is used directly.
 * Otherwise, scan all sessions to find which one owns the tab.
 */
function findSessionForTab(tab: string): string | null {
  const envSession = process.env.ZELLIJ_SESSION_NAME;
  if (envSession) {
    // Verify the tab actually lives in this session before trusting it.
    try {
      const out = execSync(
        `ZELLIJ_SESSION_NAME='${escapeTabValue(envSession)}' zellij action query-tab-names 2>/dev/null || true`,
        { encoding: "utf-8" },
      );
      if (out.split("\n").some((line) => line.trim().toLowerCase() === tab.toLowerCase())) {
        return envSession;
      }
    } catch { /* fall through to full scan */ }
  }

  // Scan all sessions for the tab.
  try {
    const sessions = execSync("zellij list-sessions -n 2>/dev/null || true", { encoding: "utf-8" })
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);

    for (const session of sessions) {
      try {
        const out = execSync(
          `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}' zellij action query-tab-names 2>/dev/null || true`,
          { encoding: "utf-8" },
        );
        if (out.split("\n").some((line) => line.trim().toLowerCase() === tab.toLowerCase())) {
          return session;
        }
      } catch { /* try next */ }
    }
  } catch { /* no sessions */ }

  return null;
}

function getOpenZellijTabs(session: string): string[] {
  try {
    const out = execSync(
      `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}' zellij action query-tab-names 2>/dev/null || true`,
      { encoding: "utf-8" },
    );
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function ensureTabExists(tab: string, session: string): void {
  const open = getOpenZellijTabs(session);
  if (!open.some((t) => t.toLowerCase() === tab.toLowerCase())) {
    execSync(
      `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}' zellij action new-tab --name '${escapeTabValue(tab)}'`,
    );
    execSync("sleep 0.5");
  }
}

function restartTab(tab: string, command: string, session: string): void {
  const env = `ZELLIJ_SESSION_NAME='${escapeTabValue(session)}'`;
  execSync(`${env} zellij action go-to-tab-name '${escapeTabValue(tab)}'`);
  execSync("sleep 0.2");
  execSync(`${env} zellij action write 3`);
  execSync("sleep 0.1");
  execSync(`${env} zellij action write-chars '${escapeTabValue(command)}'`);
  execSync("sleep 0.1");
  execSync(`${env} zellij action write 13`);
}

export function launchAgentInTab(tab: string, dir: string, agent: AgentOption, model?: string): void {
  // Try to find the existing session; fall back to any available session for new-tab creation.
  let session = findSessionForTab(tab);

  if (!session) {
    // Tab doesn't exist yet — find any session to create it in.
    try {
      const sessions = execSync("zellij list-sessions -n 2>/dev/null || true", { encoding: "utf-8" })
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0])
        .filter(Boolean);
      session = sessions[0] ?? null;
    } catch { /* ignore */ }
  }

  if (!session) {
    throw new Error("No Zellij session found — start Zellij first.");
  }

  ensureTabExists(tab, session);
  const command = buildAgentOptionLaunchCommand({ agent, model }, dir);
  restartTab(tab, command, session);
}
