import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { launchAgentInTab } from "@/lib/agent-runtime";
import { listAgentRegistry } from "@/lib/agent-registry";
import { isRuntimeAvailable } from "@/lib/runtime";
import { getApiUserId } from "@/lib/session";
import { enqueueLaunchAgentCommand } from "@/db/queries/pending-commands";

const LaunchAgentBody = z.object({
  tab: z.string().trim().min(1).max(120),
  dir: z.string().trim().min(1).max(500),
  agent: z.string().trim().min(1).max(40),
  model: z.string().trim().max(160).optional(),
  initialPrompt: z.string().trim().max(4000).optional(),
});

const AGENT_BASENAMES = new Set(["claude", "codex", "gemini", "openclaw"]);

function isCursorAgentArgv0(argv0: string): boolean {
  return argv0.includes(".local/bin/agent") || argv0.includes("/.cursor/");
}

function isAgentRunningIn(dir: string): boolean {
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const argv0 = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0")[0] ?? "";
        const basename = argv0.split("/").pop() ?? "";
        const isKnownAgent = AGENT_BASENAMES.has(basename)
          || (basename === "agent" && isCursorAgentArgv0(argv0));
        if (!isKnownAgent) continue;
        if (fs.readlinkSync(`/proc/${entry}/cwd`) === dir) return true;
      } catch { /* skip */ }
    }
  } catch { /* /proc unavailable */ }
  return false;
}

function scheduleInjectAfterLaunch(tab: string, dir: string, prompt: string): void {
  const queuePath = `/tmp/agent-queue-${tab.toLowerCase()}`;
  // Write to queue file immediately as fallback (beacon auto-continue will pick it up)
  try {
    fs.writeFileSync(queuePath, JSON.stringify([prompt]));
  } catch { /* best effort */ }

  // Poll every 3s for the agent process to appear, then inject directly (up to 30s total)
  let attempts = 0;
  const tryInject = async () => {
    attempts++;
    if (isAgentRunningIn(dir)) {
      try {
        const { injectIntoTab } = await import("@/lib/zellij");
        injectIntoTab(tab, prompt);
        // Inject succeeded — clear queue so the same prompt isn't re-fired on next stop
        try { fs.unlinkSync(queuePath); } catch { /* already gone */ }
      } catch { /* inject failed — queue file remains for beacon pickup */ }
      return;
    }
    if (attempts < 10) setTimeout(tryInject, 3000);
    // After 10 attempts (~30s) give up; queue file is still there for beacon pickup
  };
  setTimeout(tryInject, 3000);
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, LaunchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, agent, model, initialPrompt } = dataOrResp;
  const registry = listAgentRegistry();
  const exactEntry = registry.find((candidate) => candidate.id === agent);
  if (!exactEntry) {
    return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }
  if (isRuntimeAvailable() && !exactEntry.available) {
    return NextResponse.json({ error: exactEntry.availabilityReason ?? `${exactEntry.label} is not available on this machine.` }, { status: 400 });
  }
  if (!exactEntry.capabilities.tabSwitching) {
    return NextResponse.json({ error: `${exactEntry.label} does not support launching into a development tab yet.` }, { status: 400 });
  }

  if (!isRuntimeAvailable()) {
    const commandId = await enqueueLaunchAgentCommand(userId, { tab, dir, agent, model, initialPrompt });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId, tab, agent });
  }

  try {
    launchAgentInTab(tab, dir, exactEntry.id, model);
    if (initialPrompt?.trim()) {
      scheduleInjectAfterLaunch(tab, dir, initialPrompt.trim());
    }
    return NextResponse.json({ ok: true, tab, agent: exactEntry.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Launch failed: ${message}` }, { status: 500 });
  }
}
