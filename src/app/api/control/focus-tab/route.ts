import { execSync } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { shellEscape } from "@/lib/zellij";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getApiUserId } from "@/lib/session";
import { enqueueTabCommand } from "@/db/queries/pending-commands";

const FocusTabBody = z.object({
  tab: z.string().trim().min(1).max(120),
});

function listSessions(): string[] {
  try {
    const out = execSync("zellij list-sessions --no-formatting 2>/dev/null", {
      encoding: "utf-8",
      timeout: 2000,
    });
    // Output format: "<name> [Created <n>s ago] [(current)]"
    return out.split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getTabsForSession(session: string): string[] {
  try {
    const out = execSync(
      `zellij --session ${shellEscape(session)} action query-tab-names 2>/dev/null`,
      { encoding: "utf-8", timeout: 2000 },
    );
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function switchTab(session: string, tab: string): void {
  execSync(
    `zellij --session ${shellEscape(session)} action go-to-tab-name ${shellEscape(tab)}`,
    { stdio: "ignore" },
  );
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isRuntimeAvailable()) {
    const dataOrResp = await readJsonBody(req, FocusTabBody);
    if (dataOrResp instanceof NextResponse) return dataOrResp;
    const commandId = await enqueueTabCommand(userId, "focus_tab", { tab: dataOrResp.tab });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId });
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
