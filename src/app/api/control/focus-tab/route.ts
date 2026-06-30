import { execSync } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getZellijSessionsSync, shellEscape } from "@/lib/zellij";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getApiUserId } from "@/lib/session";
import { enqueueTabCommand } from "@/db/queries/pending-commands";
import { executionAccessErrorBody, resolveQueuedExecution } from "@/lib/execution-access";

const FocusTabBody = z.object({
  tab: z.string().trim().min(1).max(120),
});

function listSessions(): string[] {
  return getZellijSessionsSync();
}

function getTabsForSession(session: string): string[] {
  const commands = [
    `zellij --session ${shellEscape(session)} action query-tab-names 2>/dev/null`,
    `ZELLIJ_SESSION_NAME=${shellEscape(session)} zellij action query-tab-names 2>/dev/null`,
  ];
  for (const command of commands) {
    try {
      const out = execSync(command, { encoding: "utf-8", timeout: 2000 });
      const tabs = out.split("\n").map((s) => s.trim()).filter(Boolean);
      if (tabs.length > 0) return tabs;
    } catch {
      // Try next addressing mode.
    }
  }
  return [];
}

function switchTab(session: string, tab: string): void {
  try {
    execSync(
      `zellij --session ${shellEscape(session)} action go-to-tab-name ${shellEscape(tab)}`,
      { stdio: "ignore" },
    );
    return;
  } catch {
    execSync(
      `ZELLIJ_SESSION_NAME=${shellEscape(session)} zellij action go-to-tab-name ${shellEscape(tab)}`,
      { stdio: "ignore" },
    );
  }
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isRuntimeAvailable()) {
    const dataOrResp = await readJsonBody(req, FocusTabBody);
    if (dataOrResp instanceof NextResponse) return dataOrResp;
    const execution = await resolveQueuedExecution(userId, { defaultChannel: "cloud" });
    if (!execution.ok) {
      return NextResponse.json(executionAccessErrorBody(execution), { status: execution.status });
    }
    const commandId = await enqueueTabCommand(userId, "focus_tab", {
      tab: dataOrResp.tab,
      ...(execution.channel ? { channel: execution.channel } : {}),
    });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId, runnerConnected: execution.runnerConnected });
  }

  const dataOrResp = await readJsonBody(req, FocusTabBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab } = dataOrResp;

  try {
    // Fast path: current session (ZELLIJ_SESSION_NAME set when server runs inside zellij)
    const currentSession = process.env.ZELLIJ_SESSION_NAME;
    if (currentSession) {
      const tabs = getTabsForSession(currentSession);
      if (tabs.some((t) => t.toLowerCase() === tab.toLowerCase())) {
        switchTab(currentSession, tab);
        return NextResponse.json({ ok: true, session: currentSession });
      }
    }

    // Search all other sessions
    const sessions = listSessions();
    for (const session of sessions) {
      if (session === currentSession) continue;
      const tabs = getTabsForSession(session);
      if (tabs.some((t) => t.toLowerCase() === tab.toLowerCase())) {
        switchTab(session, tab);
        return NextResponse.json({ ok: true, session });
      }
    }

    return NextResponse.json(
      { error: `Tab "${tab}" not found in any Zellij session` },
      { status: 404 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to focus workspace tab" },
      { status: 500 },
    );
  }
}
