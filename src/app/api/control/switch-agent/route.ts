import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { isRuntimeAvailable } from "@/lib/runtime";
import { listAgentRegistry, isAgentId, buildAgentOptionLaunchCommand } from "@/lib/agent-registry";
import { injectIntoTab } from "@/lib/zellij";
import { getCurrentUserId } from "@/lib/session";
import { enqueueSwitchAgentCommand } from "@/db/queries/pending-commands";

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

export async function POST(req: NextRequest) {
  const dataOrResp = await readJsonBody(req, SwitchAgentBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const { tab, dir, toAgent, fromAgent, model } = dataOrResp;

  if (!isAgentId(toAgent)) {
    return NextResponse.json({ error: `Unknown agent: ${toAgent}` }, { status: 400 });
  }

  // Cloud mode: enqueue for the local daemon to execute.
  if (!isRuntimeAvailable()) {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const commandId = await enqueueSwitchAgentCommand(userId, { tab, dir, toAgent, fromAgent, model });
    return NextResponse.json({ ok: true, queued: true, mode: "queued", commandId });
  }

  const registry = listAgentRegistry();

  try {
    // Step 1: quit the current agent if we know what it is.
    if (fromAgent && isAgentId(fromAgent) && fromAgent !== toAgent) {
      const fromEntry = registry.find((e) => e.id === fromAgent);
      if (fromEntry?.quitCommand) {
        injectIntoTab(tab, fromEntry.quitCommand);
        // Give the agent time to exit and return to shell prompt.
        await sleep(900);
      }
    }

    // Step 2: launch the new agent.
    const launchCmd = buildAgentOptionLaunchCommand({ agent: toAgent, model }, dir);
    injectIntoTab(tab, launchCmd);

    return NextResponse.json({ ok: true, toAgent, fromAgent: fromAgent ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to switch agent" },
      { status: 500 },
    );
  }
}
