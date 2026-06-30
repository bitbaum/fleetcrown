import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { listAgentRegistry, isAgentId, buildAgentOptionLaunchCommand, type Agent } from "@/lib/agent-registry";
import { injectIntoTab, sendRawKey } from "@/lib/zellij";
import { getSessionUserId } from "@/lib/session";
import { enqueueSwitchAgentCommand } from "@/db/queries/pending-commands";
import { resolveOutgoingAgentForDir, resolveRunningAgentsInDir } from "@/lib/agent-process-scan";
import { executionAccessErrorBody, resolveQueuedExecution } from "@/lib/execution-access";

const SwitchAgentBody = z.object({
  tab:       z.string().trim().min(1).max(120),
  dir:       z.string().trim().min(1),
  toAgent:   z.string().trim().min(1),
  fromAgent: z.string().trim().optional(),
  model:     z.string().trim().optional(),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAgentRunningInDir(processMatchers: string[], dir: string): boolean {
  try {
    for (const entry of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
        const argv0 = cmdline.split("\0")[0] ?? "";
        const basename = argv0.includes("/") ? argv0.split("/").pop()! : argv0;
        if (!processMatchers.some((m) => basename === m || basename.startsWith(`${m}-`))) continue;
        const cwd = fs.readlinkSync(`/proc/${entry}/cwd`);
        if (cwd === dir || cwd.startsWith(dir + "/")) return true;
      } catch { /* process gone or permission denied */ }
    }
  } catch { /* /proc unavailable */ }
  return false;
}

async function quitAgentInTab(
  tab: string,
  agentId: Agent,
  dir: string,
  registry: ReturnType<typeof listAgentRegistry>,
): Promise<void> {
  const entry = registry.find((e) => e.id === agentId);
  if (!entry) return;

  if (entry.quitCommand) {
    injectIntoTab(tab, entry.quitCommand);
    await sleep(400);
  }

  await sleep(200);
  sendRawKey(tab, 3);
  await sleep(600);

  if (entry.processMatchers?.length) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      await sleep(200);
      if (!isAgentRunningInDir(entry.processMatchers, dir)) return;
    }
  }
}

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, SwitchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, toAgent, fromAgent, model } = dataOrResp;

  if (!isAgentId(toAgent)) {
    return NextResponse.json({ error: `Unknown agent: ${toAgent}` }, { status: 400 });
  }

  // Cloud mode: enqueue for the local runner to execute.
  if (!isRuntimeAvailable()) {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const execution = await resolveQueuedExecution(userId, { defaultChannel: "cloud" });
    if (!execution.ok) {
      return NextResponse.json(executionAccessErrorBody(execution), { status: execution.status });
    }
    const resolvedFrom = resolveOutgoingAgentForDir(dir, fromAgent) ?? fromAgent;
    const commandId = await enqueueSwitchAgentCommand(userId, {
      tab,
      ...(execution.channel ? { channel: execution.channel } : {}),
      dir,
      toAgent,
      fromAgent: resolvedFrom,
      model,
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      mode: "queued",
      commandId,
      fromAgent: resolvedFrom ?? null,
      runnerConnected: execution.runnerConnected,
    });
  }

  const registry = listAgentRegistry();

  try {
    const running = resolveRunningAgentsInDir(dir);
    const outgoing = resolveOutgoingAgentForDir(dir, fromAgent);
    const agentsToQuit = running.length
      ? running.filter((id) => id !== toAgent)
      : outgoing && outgoing !== toAgent
      ? [outgoing]
      : [];

    for (const agentId of agentsToQuit) {
      await quitAgentInTab(tab, agentId, dir, registry);
    }

    if (agentsToQuit.length === 0 && fromAgent && isAgentId(fromAgent) && fromAgent !== toAgent) {
      await quitAgentInTab(tab, fromAgent, dir, registry);
    }

    const launchCmd = buildAgentOptionLaunchCommand({ agent: toAgent, model }, dir);
    injectIntoTab(tab, launchCmd);

    return NextResponse.json({
      ok: true,
      toAgent,
      fromAgent: outgoing ?? fromAgent ?? null,
      quitAgents: agentsToQuit,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to switch agent" },
      { status: 500 },
    );
  }
}
